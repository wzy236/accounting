import { ActionIcon, Button, Checkbox, Divider, Group, Indicator, Popover, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';

export const NO_ACCOUNT = 'none';

/**
 * 记账页的筛选：时间范围（按月翻 / 全部日期）+ 账户多选（含“未关联账户”）。
 * accountIds 是账户 id 字符串数组，range 是 'month' 或 'all'。
 */
export default function TransactionFilter({ accounts, accountIds, onAccountsChange, range, onRangeChange, onClear }) {
  const activeCount = accountIds.length + (range === 'all' ? 1 : 0);
  return (
    <Popover position="bottom-end" withinPortal shadow="md" width={260}>
      <Popover.Target>
        <Indicator disabled={activeCount === 0} label={activeCount} size={16} color="coral" offset={4}>
          <ActionIcon variant={activeCount ? 'light' : 'subtle'} color={activeCount ? 'coral' : 'gray'} size="lg" aria-label="筛选">
            <IconFilter size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={600}>时间范围</Text>
          <SegmentedControl
            fullWidth
            size="xs"
            data={[{ label: '按月', value: 'month' }, { label: '全部日期', value: 'all' }]}
            value={range}
            onChange={onRangeChange}
          />

          {accounts.length > 0 && (
            <>
              <Divider />
              <Text size="sm" fw={600}>账户</Text>
              <Checkbox.Group value={accountIds} onChange={onAccountsChange}>
                <Stack gap={10}>
                  {accounts.map((a) => (
                    <Checkbox
                      key={a.id}
                      value={String(a.id)}
                      label={(
                        <Group gap={6} wrap="nowrap">
                          <span className="dot" style={{ background: a.color }} />
                          {a.name}
                        </Group>
                      )}
                    />
                  ))}
                  <Checkbox value={NO_ACCOUNT} label={<Text size="sm" c="dimmed">未关联账户</Text>} />
                </Stack>
              </Checkbox.Group>
            </>
          )}

          <Button
            variant="subtle"
            size="xs"
            color="gray"
            disabled={activeCount === 0}
            onClick={onClear}
          >
            清除全部筛选
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
