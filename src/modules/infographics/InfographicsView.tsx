import React, { useMemo } from 'react';
import { CalendarDays, ClipboardCheck, FileCheck2, Lightbulb, PenTool, Scale, Send, ShieldCheck, UserCog } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { toPersianDigits } from '../../utils/formatters';
import { getInfographicStages, InfographicStage } from './infographicStages';

/** آیکون و رنگ اختصاصی هر مرحله (سبک سه‌بعدی ملایم). */
const ICONS: Record<InfographicStage['icon'], { icon: React.ElementType; tone: string }> = {
  proposal: { icon: Lightbulb, tone: 'igs-gold' },
  review: { icon: Scale, tone: 'igs-blue' },
  meeting: { icon: CalendarDays, tone: 'igs-blue' },
  resolution: { icon: FileCheck2, tone: 'igs-blue' },
  sign: { icon: PenTool, tone: 'igs-navy' },
  notice: { icon: Send, tone: 'igs-sky' },
  execute: { icon: UserCog, tone: 'igs-navy' },
  followup: { icon: ClipboardCheck, tone: 'igs-blue' },
  verify: { icon: ShieldCheck, tone: 'igs-navy' },
};

// مسیر پیوسته و خوانا: شماره‌ها دقیقاً با جهت فلش‌ها حرکت می‌کنند.
const VIEW_W = 1000;
const VIEW_H = 580;
const ROWS = [128, 318, 508];
const SLOTS: { x: number; y: number }[] = [
  { x: 820, y: ROWS[0] }, { x: 520, y: ROWS[0] }, { x: 220, y: ROWS[0] },
  { x: 220, y: ROWS[1] }, { x: 520, y: ROWS[1] }, { x: 820, y: ROWS[1] },
  { x: 820, y: ROWS[2] }, { x: 520, y: ROWS[2] }, { x: 220, y: ROWS[2] },
];
const PATH = `M 820 ${ROWS[0]} L 220 ${ROWS[0]} C 120 ${ROWS[0]} 120 ${ROWS[1]} 220 ${ROWS[1]} L 820 ${ROWS[1]} C 920 ${ROWS[1]} 920 ${ROWS[2]} 820 ${ROWS[2]} L 220 ${ROWS[2]}`;
const CHEVRONS = [
  { x: 670, y: ROWS[0], dir: -1 }, { x: 370, y: ROWS[0], dir: -1 },
  { x: 370, y: ROWS[1], dir: 1 }, { x: 670, y: ROWS[1], dir: 1 },
  { x: 670, y: ROWS[2], dir: -1 }, { x: 370, y: ROWS[2], dir: -1 },
];

/**
 * اینفوگراف «مسیر مصوبه از پیشنهاد تا خاتمه» با جهت واقعی گردش کار.
 * داده (شماره، عنوان، توضیح، آیکون، ترتیب) از آرایه مستقل infographicStages می‌آید.
 */
export const InfographicsView: React.FC = () => {
  const { navigateTo } = useApp();
  const stages = useMemo(getInfographicStages, []);

  return (
    <section className="igs">
      <span className="igs-bubble igs-b1" /><span className="igs-bubble igs-b2" /><span className="igs-bubble igs-b3" />
      <h2 className="igs-title">مسیر مصوبه از <span>پیشنهاد</span> تا خاتمه</h2>

      {/* دسکتاپ و تبلت: مسیر مارپیچ */}
      <div className="igs-stage">
        <svg className="igs-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
          <defs>
            <linearGradient id="igs-path" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>
            <radialGradient id="igs-bead" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="60%" stopColor="#bfdbfe" />
              <stop offset="100%" stopColor="#60a5fa" />
            </radialGradient>
            <filter id="igs-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5" /></filter>
          </defs>
          <path d={PATH} fill="none" stroke="#bfdbfe" strokeWidth="30" strokeLinecap="round" opacity="0.55" filter="url(#igs-glow)" />
          <path d={PATH} fill="none" stroke="#dbeafe" strokeWidth="20" strokeLinecap="round" />
          <path d={PATH} fill="none" stroke="url(#igs-path)" strokeWidth="9" strokeLinecap="round" />
          <path d={PATH} fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          {CHEVRONS.map((c) => (
            <g key={`${c.x}-${c.y}`} transform={`translate(${c.x} ${c.y}) scale(${c.dir} 1)`} opacity="0.95">
              <path d="M -6 -7 L 2 0 L -6 7" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 3 -7 L 11 0 L 3 7" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
        </svg>

        {stages.slice(0, SLOTS.length).map((stage, i) => {
          const { icon: Icon, tone } = ICONS[stage.icon];
          const slot = SLOTS[i];
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => navigateTo(stage.route)}
              className="igs-node"
              style={{ left: `${(slot.x / VIEW_W) * 100}%`, top: `${(slot.y / VIEW_H) * 100}%` }}
              title={`رفتن به بخش «${stage.title}»`}
            >
              <span className="igs-pedestal" />
              <span className={`igs-icon ${tone}`}><Icon strokeWidth={2.2} /></span>
              <span className="igs-num">{toPersianDigits(stage.id)}</span>
              <span className="igs-label">
                <b>{stage.title}</b>
                <small>{stage.description}</small>
              </span>
            </button>
          );
        })}
      </div>

      {/* موبایل: همان ترتیب به‌صورت عمودی */}
      <ol className="igs-mobile">
        {stages.map((stage) => {
          const { icon: Icon, tone } = ICONS[stage.icon];
          return (
            <li key={stage.id}>
              <button type="button" onClick={() => navigateTo(stage.route)} className="igs-mrow">
                <span className={`igs-icon igs-icon-sm ${tone}`}><Icon strokeWidth={2.2} /></span>
                <span className="igs-num igs-num-sm">{toPersianDigits(stage.id)}</span>
                <span className="min-w-0 flex-1 text-right">
                  <b className="block text-[14px] font-bold text-[#0b2a8a]">{stage.title}</b>
                  <small className="block text-[13px] leading-6 text-slate-600">{stage.description}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
