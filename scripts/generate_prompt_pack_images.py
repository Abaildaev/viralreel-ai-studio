"""
Генерация примеров для пака промптов через snapgen.ai (Nano Banana Pro).

Один исходник на все десять формул — так в паке видно, что результат меняет
промпт, а не новая съёмка. Два промпта из десяти работают наоборот, они чинят
испорченный кадр, поэтому для них исходник специально портится: подать им
чистое фото значит показать пару «до и после», где ничего не изменилось.

Скрипт идемпотентен: готовый файл не перегенерируется, поэтому повторный
запуск после сбоя стоит ноль кредитов. Ключ читается из .env.local и в
репозиторий не попадает.

    python3 scripts/generate_prompt_pack_images.py            # чего не хватает
    python3 scripts/generate_prompt_pack_images.py --only 01  # один промпт
    python3 scripts/generate_prompt_pack_images.py --force    # перегенерировать
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prompt_pack_data import PROMPTS, SLUGS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "scripts" / "assets" / "prompt-pack-v2"
BASE = OUT / "00-before.png"
DEGRADED = OUT / "00-before-damaged.jpg"
FLAT = OUT / "00-before-flat.jpg"

API = "https://api.snapgen.ai/uapi/v1"
MODEL = "nano-banana-pro"

#: Тариф модели — 5 запросов в минуту. Тринадцать секунд оставляют зазор.
SUBMIT_INTERVAL_S = 13
POLL_INTERVAL_S = 8
POLL_TIMEOUT_S = 420

#: Предохранитель: опечатка в цикле не должна съесть баланс.
MAX_GENERATIONS_PER_RUN = 14

#: Эти две формулы восстанавливают кадр, а не стилизуют его.
SOURCE_OVERRIDES = {"09": DEGRADED, "10": FLAT}


def api_key() -> str:
    key = os.environ.get("SNAPGEN_API_KEY", "").strip()
    if key:
        return key

    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "SNAPGEN_API_KEY":
                return value.strip()

    sys.exit("SNAPGEN_API_KEY не найден: добавьте его в .env.local")


#: Защита перед API отклоняет клиентов, которые представляются `Python-urllib`:
#: запрос без этого заголовка возвращает 403 ещё до проверки ключа.
USER_AGENT = "prompt-pack-generator/1.0 (+https://snapgen.ai)"


#: Оба сбоя первого прогона были сетевыми — отвалившийся DNS и таймаут, —
#: а не отказами API. Одна попытка на такое тратит целую генерацию впустую.
NETWORK_ATTEMPTS = 3


def request_json(url: str, key: str, data: bytes | None = None, headers: dict | None = None):
    last: Exception | None = None
    for attempt in range(1, NETWORK_ATTEMPTS + 1):
        try:
            return _request_json_once(url, key, data, headers)
        except urllib.error.HTTPError:
            raise  # ответ сервера — это не сбой связи, повторять нечего
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = error
            if attempt < NETWORK_ATTEMPTS:
                print(f"      сеть подвела ({error}), повтор {attempt + 1}")
                time.sleep(4 * attempt)
    raise last if last else RuntimeError("сеть недоступна")


def _request_json_once(url: str, key: str, data: bytes | None, headers: dict | None):
    request = urllib.request.Request(url, data=data)
    request.add_header("x-api-key", key)
    request.add_header("User-Agent", USER_AGENT)
    for name, value in (headers or {}).items():
        request.add_header(name, value)
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def multipart(fields: dict[str, str], files: dict[str, Path]) -> tuple[bytes, str]:
    """Ровно тот multipart, который ждёт generate_image, без зависимостей."""
    boundary = "----promptpack" + str(int(time.time() * 1000))
    chunks: list[bytes] = []

    for name, value in fields.items():
        chunks.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n".encode("utf-8")
        )

    for name, path in files.items():
        suffix = path.suffix.lower()
        mime = "image/png" if suffix == ".png" else "image/jpeg"
        chunks.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
            f'filename="{path.name}"\r\nContent-Type: {mime}\r\n\r\n'.encode("utf-8")
        )
        chunks.append(path.read_bytes())
        chunks.append(b"\r\n")

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def prepare_damaged_sources() -> None:
    """
    Убитый и вялый варианты исходника.

    «Photo Rescue» и «Cinematic Remaster» обещают вытащить кадр, а не
    перерисовать его. Показывать их работу на чистом снимке нечестно — на
    паре «до и после» не будет видно ничего.
    """
    if not BASE.exists():
        sys.exit(f"Нет исходника {BASE}")

    original = Image.open(BASE).convert("RGB")

    if not DEGRADED.exists():
        width, height = original.size
        small = original.resize((width // 5, height // 5), Image.BILINEAR)
        damaged = small.resize((width, height), Image.BILINEAR)
        damaged = damaged.filter(ImageFilter.GaussianBlur(1.4))
        damaged = ImageEnhance.Color(damaged).enhance(0.72)
        damaged = ImageEnhance.Contrast(damaged).enhance(0.82)
        damaged.save(DEGRADED, "JPEG", quality=18)
        print(f"  подготовлен убитый исходник: {DEGRADED.name}")

    if not FLAT.exists():
        flat = ImageEnhance.Contrast(original).enhance(0.72)
        flat = ImageEnhance.Color(flat).enhance(0.65)
        flat = ImageEnhance.Brightness(flat).enhance(0.94)
        flat = flat.filter(ImageFilter.GaussianBlur(0.4))
        flat.save(FLAT, "JPEG", quality=62)
        print(f"  подготовлен вялый исходник: {FLAT.name}")


def submit(key: str, prompt: str, source: Path) -> str:
    body, content_type = multipart(
        {
            "prompt": prompt,
            "model": MODEL,
            "aspect_ratio": "9:16",
            # Стиль уже описан в самом промпте; второй поверх него смазывает
            # разницу между формулами.
            "style": "None",
            "resolution": "2K",
        },
        {"files": source},
    )
    answer = request_json(
        f"{API}/generate_image", key, body, {"Content-Type": content_type}
    )
    if not answer.get("uuid"):
        raise RuntimeError(f"Ответ без uuid: {answer}")
    return answer["uuid"]


def wait_for_image(key: str, uuid: str) -> tuple[str, int]:
    deadline = time.time() + POLL_TIMEOUT_S

    while time.time() < deadline:
        time.sleep(POLL_INTERVAL_S)
        record = request_json(f"{API}/history/{uuid}", key)
        status = record.get("status")

        if status == 3:
            raise RuntimeError(record.get("error_message") or "генерация не удалась")

        if status == 2:
            images = record.get("generated_image") or []
            if not images or not images[0].get("image_url"):
                raise RuntimeError("готово, но ссылки на файл нет")
            return images[0]["image_url"], int(record.get("used_credit") or 0)

    raise RuntimeError(f"не дождался за {POLL_TIMEOUT_S}с")


def download(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=180) as response:
        target.write_bytes(response.read())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="номера промптов, например 01 04")
    parser.add_argument("--force", action="store_true", help="перегенерировать готовое")
    args = parser.parse_args()

    key = api_key()
    OUT.mkdir(parents=True, exist_ok=True)
    prepare_damaged_sources()

    queue = []
    for number, name, _, prompt in PROMPTS:
        if args.only and number not in args.only:
            continue
        target = OUT / f"{number}-{SLUGS[number]}.png"
        if target.exists() and not args.force:
            print(f"  {number} {name}: уже есть, пропускаю")
            continue
        queue.append((number, name, prompt, target))

    if not queue:
        print("Всё на месте.")
        return

    if len(queue) > MAX_GENERATIONS_PER_RUN:
        sys.exit(f"Запрошено {len(queue)} генераций при лимите {MAX_GENERATIONS_PER_RUN}")

    print(f"\nГенерирую {len(queue)} шт. по {SUBMIT_INTERVAL_S}с между запросами\n")

    credits = 0
    failed: list[str] = []

    for index, (number, name, prompt, target) in enumerate(queue):
        source = SOURCE_OVERRIDES.get(number, BASE)
        print(f"[{index + 1}/{len(queue)}] {number} {name} ← {source.name}")

        try:
            uuid = submit(key, prompt, source)
            url, used = wait_for_image(key, uuid)
            download(url, target)
            credits += used
            size_mb = target.stat().st_size / 1024 / 1024
            print(f"      готово: {target.name} ({size_mb:.1f} МБ, {used} кредитов)")
        except Exception as error:  # noqa: BLE001 — одна неудача не рушит пачку
            failed.append(f"{number} {name}: {error}")
            print(f"      НЕ ВЫШЛО: {error}")

        if index + 1 < len(queue):
            time.sleep(SUBMIT_INTERVAL_S)

    print(f"\nПотрачено кредитов: {credits}")
    if failed:
        print("Не получилось:")
        for line in failed:
            print(f"  {line}")
        print("Повторный запуск догенерирует только их.")


if __name__ == "__main__":
    main()
