import { ActionIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

/**
 * 页面顶部标题栏（手机端吸顶）：左边标题（子页面在手机端带返回按钮），中间放月份切换之类，右边放操作按钮。
 */
export default function PageHeader({ title, back, center, right }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      <div className="page-header-inner">
        <div className="page-header-left">
          {back && (
            <ActionIcon variant="subtle" color="gray" size="lg" hiddenFrom="sm" onClick={() => navigate(back)} aria-label="返回">
              <IconChevronLeft size={22} />
            </ActionIcon>
          )}
          <span className="page-title">{title}</span>
        </div>
        <div>{center}</div>
        <div className="page-header-right">{right}</div>
      </div>
    </header>
  );
}

export function PeriodSwitcher({ label, onPrev, onNext }) {
  return (
    <div className="period-switcher">
      <ActionIcon variant="subtle" color="gray" size="lg" onClick={onPrev} aria-label="上一个">
        <IconChevronLeft size={20} />
      </ActionIcon>
      <span className="period-label">{label}</span>
      <ActionIcon variant="subtle" color="gray" size="lg" onClick={onNext} aria-label="下一个">
        <IconChevronRight size={20} />
      </ActionIcon>
    </div>
  );
}
