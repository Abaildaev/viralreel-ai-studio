import React from 'react';

interface SectionProps {
  /** Shown in a badge when the section is one step of an ordered flow. */
  step?: number | string;
  title: string;
  hint?: string;
  /** Optional control aligned to the right of the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The single card-with-heading pattern for form pages. Before this, each page
 * invented its own: a bare bold label here, a label with a coloured icon there,
 * a numbered circle somewhere else — which is what made the app look assembled
 * from parts rather than designed.
 */
const Section: React.FC<SectionProps> = ({ step, title, hint, action, children, className = '' }) => (
  <section className={`card p-5 ${className}`}>
    <div className="flex items-start gap-3 mb-4">
      {step !== undefined && (
        <span className="mt-0.5 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
          {step}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {hint && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{hint}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
    {children}
  </section>
);

export default Section;
