import { useEffect, useState } from 'react';
import { loadLocalValue, saveLocalValue } from './localStore';

export interface OrganizationProfile {
  name: string;
  systemTitle: string;
  logoUrl: string;
  phone: string;
  email: string;
  website: string;
  nationalId: string;
  economicCode: string;
  address: string;
}

export const DEFAULT_ORGANIZATION_PROFILE: OrganizationProfile = {
  name: '',
  systemTitle: 'سامانه مدیریت جلسات و مصوبات',
  logoUrl: '/tejarat-emblem.png',
  phone: '',
  email: '',
  website: '',
  nationalId: '',
  economicCode: '',
  address: '',
};

/** لوگوهای پیش‌فرض قبلی؛ اگر در تنظیمات ذخیره‌شده مانده باشند، لوگوی پیش‌فرض جدید جایگزین می‌شود. */
const LEGACY_DEFAULT_LOGOS = ['/pars-project.png', '/postbank.png', '/POSTBANK_PM_LOGO.png', '/POSTBANK_MO_LOGO.png', '/POSTBANK_TM_LOGO.png'];

export const getOrganizationProfile = (): OrganizationProfile => {
  const saved = loadLocalValue<Partial<OrganizationProfile>>('organizationProfile', {});
  const profile = { ...DEFAULT_ORGANIZATION_PROFILE, ...saved };
  if (!profile.logoUrl || LEGACY_DEFAULT_LOGOS.includes(profile.logoUrl)) profile.logoUrl = DEFAULT_ORGANIZATION_PROFILE.logoUrl;
  return profile;
};

export const saveOrganizationProfile = (profile: OrganizationProfile): void => {
  saveLocalValue('organizationProfile', profile);
  window.dispatchEvent(new Event('organization-profile-changed'));
};

export const useOrganizationProfile = (): OrganizationProfile => {
  const [profile, setProfile] = useState<OrganizationProfile>(getOrganizationProfile);
  useEffect(() => {
    const refresh = () => setProfile(getOrganizationProfile());
    window.addEventListener('organization-profile-changed', refresh);
    return () => window.removeEventListener('organization-profile-changed', refresh);
  }, []);
  return profile;
};
