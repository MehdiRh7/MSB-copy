import React from 'react';

interface PageHeaderProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/** سربرگ یکدست صفحات اصلی: آیکون آبی، عنوان واضح و اقدام‌های صفحه. */
export const PageHeader: React.FC<PageHeaderProps> = ({ icon: Icon, title, description, actions, children }) => (
  <section className="app-page-header">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="app-page-header-icon"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-[12px] leading-6 text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {children}
  </section>
);
