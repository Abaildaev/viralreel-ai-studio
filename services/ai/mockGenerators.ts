import {
  GeneratedContentResponse,
  CtaType,
  LeadMagnetInfo,
} from './types';

export function getMockViralContent(topic: string, count: number, ctaType: CtaType = 'instagram', leadMagnet?: LeadMagnetInfo): GeneratedContentResponse {
  const variations = [];
  const hooks = [
    `Психологи доказали: ${topic} работает не так, как нас учили в школе:`,
    `90% людей допускают эту ошибку в ${topic} и теряют деньги:`,
    `Единственный секрет ${topic}, о котором молчат эксперты:`,
    `Как освоить ${topic} за 7 дней без бюджета и сторонней помощи:`,
    `Формула ${topic}: 3 простых шага к результату на автомате:`,
  ];

  for (let i = 0; i < count; i++) {
    const hook = hooks[i % hooks.length];
    let caption = `Тема "${topic}" — это одна из самых ключевых возможностей года.

1. Разберитесь с фундаментальными основами и не делайте паузы.
2. Автоматизируйте рутину с помощью современных ИИ-инструментов.
3. Оптимизируйте подачу и отслеживайте цифры ежедневно.

Когда вы начнете регулярно внедрять эти шаги, ваш результат вырастет в 3-5 раз.`;

    if (ctaType === 'codeword' && leadMagnet) {
      caption += `\n\nНапиши «${leadMagnet.codeword}» в директ, чтобы получить гайд "${leadMagnet.title}".`;
    } else {
      caption += `\n\nПодписывайся, чтобы получать больше экспертных разборов ежедневно! 🚀`;
    }

    variations.push({ hook, caption });
  }

  return { variations };
}
