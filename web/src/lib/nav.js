import { IconPigMoney, IconRepeat, IconTags, IconFileImport } from '@tabler/icons-react';

/** 手机端收在「更多」里、电脑端在侧边栏「管理」分组下的页面。 */
export const MORE_NAV = [
  { to: '/budget', label: '预算', icon: IconPigMoney },
  { to: '/categories', label: '分类管理', icon: IconTags },
  { to: '/bills', label: '定时账单', icon: IconRepeat },
  { to: '/import', label: '导入对账单', icon: IconFileImport },
];
