import { Button, Code, Group, Stack, Text } from '@mantine/core';
import { IconCopy, IconDownload } from '@tabler/icons-react';
import { useData } from '../lib/DataContext.jsx';
import { useToast } from '../lib/toast.js';
import { todayStr } from '../lib/format.js';
import { accountsCsv, categoriesCsv, downloadCsv, summaryText } from '../lib/exportData.js';
import PageHeader from '../components/PageHeader.jsx';

export default function ExportPage() {
  const { categories, accounts, ready } = useData();
  const showToast = useToast();
  const text = summaryText(categories, accounts);
  const topCount = categories.filter((c) => !c.parent_id).length;
  const subCount = categories.length - topCount;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      showToast('已复制，可以直接粘贴');
    } catch {
      showToast('复制失败，请长按下面的文字手动复制', true);
    }
  }

  return (
    <>
      <PageHeader title="导出分类和账户" back="/more" />
      <div className="page-body">
        <Stack gap="sm">
          <div className="card">
            <Stack gap="sm" p="md">
              <Text fw={600} size="sm">复制为文字</Text>
              <Text size="sm" c="dimmed">
                只有分类和账户的名字，不含余额，适合直接发给别人，比如让 Claude 按你的分类整理账单。
              </Text>
              <Code block className="export-preview">{ready ? text : '加载中…'}</Code>
              <Group>
                <Button size="xs" leftSection={<IconCopy size={14} />} onClick={copyText} disabled={!ready}>复制文字</Button>
              </Group>
            </Stack>
          </div>

          <div className="card">
            <Stack gap="sm" p="md">
              <Text fw={600} size="sm">下载 CSV</Text>
              <Text size="sm" c="dimmed">
                分类 {topCount} 个大类、{subCount} 个子分类，每个一行；账户 {accounts.length} 个，带币种和当前余额。可以用 Excel 打开。
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconDownload size={14} />}
                  disabled={!ready}
                  onClick={() => downloadCsv(`分类_${todayStr()}.csv`, categoriesCsv(categories))}
                >
                  下载分类 CSV
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconDownload size={14} />}
                  disabled={!ready || accounts.length === 0}
                  onClick={() => downloadCsv(`账户_${todayStr()}.csv`, accountsCsv(accounts))}
                >
                  下载账户 CSV
                </Button>
              </Group>
            </Stack>
          </div>
        </Stack>
      </div>
    </>
  );
}
