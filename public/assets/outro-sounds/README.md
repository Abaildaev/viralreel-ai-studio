# Треки для CTA-концовок

Файлы отсюда играют под карточкой концовки (последние 1–4 секунды ролика).

1. Положи сюда аудиофайл, например `soft-chime.mp3`.
2. Добавь запись в `OUTRO_SOUNDS` в `utils/outroRenderer.ts`:

```ts
export const OUTRO_SOUNDS: OutroSound[] = [
  {
    id: 'soft-chime',
    name: 'Soft Chime',
    url: '/assets/outro-sounds/soft-chime.mp3',
    description: 'Мягкий колокольчик под финальную карточку',
  },
];
```

Формат — любой, который декодирует браузер (mp3, m4a, wav).
Длина: от `outroDurationSec + 0.25` секунды; хвост длиннее просто обрежется затуханием.
