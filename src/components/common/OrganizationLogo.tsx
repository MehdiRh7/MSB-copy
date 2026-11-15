import React from 'react';

interface OrganizationLogoProps {
  className?: string;
  size?: number;
  src?: string;
}

/** لوگوی قابل جایگزینی سازمان؛ فایل پیش‌فرض از دارایی عمومی پروژه خوانده می‌شود. */
export const OrganizationLogo: React.FC<OrganizationLogoProps> = ({ className = '', size = 40, src = '/tejarat-emblem.png' }) => (
  <img
    src={src}
    alt="نشان سامانه مدیریت جلسات و مصوبات"
    width={size}
    height={size}
    className={`object-contain ${className}`}
  />
);
