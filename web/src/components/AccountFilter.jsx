import { ActionIcon, Button, Checkbox, Group, Indicator, Popover, Stack, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';

export const NO_ACCOUNT = 'none';

/** 记账页的账户筛选：可以多选账户，也可以选“未关联账户”的记录。value 是账户 id 字符串数组。 */
export default function AccountFilter({ accounts, value, onChange }) {
  const active = value.length > 0;
  return (
    <Popover position="bottom-end" withinPortal shadow="md" width={250}>
      <Popover.Target>
        <Indicator disabled={!active} label={value.length} size={16} color="coral" offset={4}>
          <ActionIcon variant={active ? 'light' : 'subtle'} color={active ? 'coral' : 'gray'} size="lg" aria-label="按账户筛选">
            <IconFilter size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={600}>按账户筛选</Text>
          <Checkbox.Group value={value} onChange={onChange}>
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
          <Button variant="subtle" size="xs" color="gray" disabled={!active} onClick={() => onChange([])}>
            清除筛选
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
