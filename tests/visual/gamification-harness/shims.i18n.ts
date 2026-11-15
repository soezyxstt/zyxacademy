import student from '../../../messages/id/student.json';
import common from '../../../messages/id/common.json';
import learning from '../../../messages/id/learning.json';
import ui from '../../../messages/id/ui.json';
const catalogs: Record<string, any> = { student, common, ui, learning };
function translator(namespace = '') {
  return (key: string, vars: Record<string, string | number> = {}) => {
    const path = [namespace, key].filter(Boolean).join('.').split('.');
    const value = path.reduce<any>((obj, part) => obj?.[part], catalogs);
    if (typeof value !== 'string') { console.warn('Missing fixture translation:', path.join('.')); return ''; }
    return value.replace(/\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\}/g, (_match, name, one, other) => {
      const count = Number(vars[name] ?? 0);
      return (new Intl.PluralRules('id').select(count) === 'one' ? one : other).replace(/#/g, new Intl.NumberFormat('id').format(count));
    }).replace(/\{(\w+)\}/g, (match, name) => String(vars[name] ?? match));
  };
}
export const useTranslations = translator;
export const useAppLocale = () => ({ locale: 'id' });
export const useLocale = () => 'id';
export const getAppLocale = async () => 'id';
export const getTranslations = async (namespace: string) => translator(namespace);
