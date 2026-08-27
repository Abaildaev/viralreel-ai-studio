import {
  GeneratedContentResponse,
  CtaType,
  LeadMagnetInfo,
} from './types';

export function getMockViralContent(topic: string, count: number, ctaType: CtaType = 'instagram', leadMagnet?: LeadMagnetInfo): GeneratedContentResponse {
  const variations = [];
  const hooks = [
    `Что в ${topic} обычно усложняют зря:`,
    `Три ошибки в ${topic}, которые стоит проверить:`,
    `Как разобрать ${topic} на понятные шаги:`,
    `Что проверить в ${topic} до первой публикации:`,
    `Практичная схема для работы с ${topic}:`,
  ];

  for (let i = 0; i < count; i++) {
    const hook = hooks[i % hooks.length];
    let caption = `Тема "${topic}" — это одна из самых ключевых возможностей года.

1. Разберитесь с фундаментальными основами и не делайте паузы.
2. Автоматизируйте рутину с помощью современных ИИ-инструментов.
3. Оптимизируйте подачу и отслеживайте цифры ежедневно.

Регулярная практика и проверка цифр помогут понять, какие шаги работают именно для вашей аудитории.`;

    if (ctaType === 'codeword' && leadMagnet) {
      caption += `\n\nНапиши «${leadMagnet.codeword}» в директ, чтобы получить гайд "${leadMagnet.title}".`;
    } else {
      caption += `\n\nПодписывайся, чтобы получать больше экспертных разборов ежедневно! 🚀`;
    }

    variations.push({ hook, caption });
  }

  return { variations };
}
