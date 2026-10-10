import { useState } from 'react';
import {
  ActionIcon, Button, ColorInput, Menu, Modal, NumberInput, SegmentedControl, Stack, Text, TextInput,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconArrowsLeftRight, IconList, IconPlus, IconScale, IconTrash, IconDotsVertical } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { confirmAction } from '../lib/confirm.jsx';
import { createAccount, deleteAccount, adjustAccountBalance } from '../lib/api.js';
import { money, todayStr } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import TransactionDrawer from '../components/TransactionDrawer.jsx';
import { SummaryBar } from '../components/TransactionList.jsx';

const SWATCHES = ['#f25a5a', '#f59f45', '#f2c94c', '#2f9e8f', '#2f7ee6', '#3d5a80', '#9b6bd8', '#e86fa8', '#8d99ae', '#333333'];

const GROUPS = [
  { type: 'bank', label: '银行账户' },
  { type: 'credit_card', label: '信用卡' },
];

function NewAccountModal({ opened, onClose, onCreated }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [initialBalance, setInitialBalance] = useState(0);
  const [color, setColor] = useState('#2f7ee6');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await createAccount(client, { name: trimmed, type, initial_balance: Number(initialBalance) || 0, color });
      showToast('已添加账户');
      setName('');
      setType('bank');
      setInitialBalance(0);
      onCreated();
      onClose();
    } catch (err) {
      showToast('添加失败：' + (err.message?.includes('duplicate') ? '账户名已存在' : err.message), true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>新增账户</Text>} centered>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput label="名称" placeholder="例如：招商银行储蓄卡" required value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
          <SegmentedControl
            fullWidth
            data={[{ label: '银行账户', value: 'bank' }, { label: '信用卡', value: 'credit_card' }]}
            value={type}
            onChange={setType}
          />
          <NumberInput
            label="初始余额"
            description="信用卡当前有欠款的话填负数，比如欠 2000 就填 -2000"
            value={initialBalance}
            onChange={setInitialBalance}
            decimalScale={2}
            thousandSeparator=","
            hideControls
            inputMode="decimal"
          />
          <ColorInput label="颜色" value={color} onChange={setColor} swatches={SWATCHES} swatchesPerRow={10} />
          <Button type="submit" loading={saving}>添加账户</Button>
        </Stack>
      </form>
    </Modal>
  );
}

function AdjustModal({ account, onClose, onAdjusted }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [target, setTarget] = useState(account ? Number(account.balance.toFixed(2)) : 0);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (target === '' || Number.isNaN(Number(target))) return;
    setSaving(true);
    try {
      const result = await adjustAccountBalance(client, account.id, account.balance, Number(target));
      showToast(result ? '已调整余额' : '余额没有变化');
      onAdjusted();
      onClose();
    } catch (err) {
      showToast('调整失败：' + err.message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">会按差额自动补一笔收入/支出记录（来源标为“余额调整”），不会直接改数字，方便以后对账。</Text>
        <NumberInput
          label="调整为"
          value={target}
          onChange={setTarget}
          decimalScale={2}
          thousandSeparator=","
          hideControls
          inputMode="decimal"
          size="lg"
          data-autofocus
        />
        <Button type="submit" loading={saving}>确认调整</Button>
      </Stack>
    </form>
  );
}

export default function AccountsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { accounts, refreshAccounts } = useData();
  const navigate = useNavigate();

  const [newOpened, setNewOpened] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const [transfer, setTransfer] = useState({ opened: false, key: 0 });

  // 余额为正算资产，为负（主要是信用卡欠款）算负债
  const assets = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const liabilities = accounts.filter((a) => a.balance < 0).reduce((s, a) => s - a.balance, 0);

  async function handleDelete(a) {
    const ok = await confirmAction({
      title: `删除「${a.name}」`,
      message: '删除后该账户下的记录会变为不关联任何账户，确认删除？',
      confirmLabel: '删除',
    });
    if (!ok) return;
    try {
      await deleteAccount(client, a.id);
      showToast('已删除');
      refreshAccounts();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  }

  const openTransfer = () => setTransfer((t) => ({ opened: true, key: t.key + 1 }));

  return (
    <>
      <PageHeader
        title="账户"
        right={(
          <>
            <Button variant="light" size="sm" visibleFrom="sm" leftSection={<IconArrowsLeftRight size={16} />} onClick={openTransfer}>转账</Button>
            <Button size="sm" visibleFrom="sm" leftSection={<IconPlus size={16} />} onClick={() => setNewOpened(true)}>新增账户</Button>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={openTransfer} aria-label="转账"><IconArrowsLeftRight size={20} /></ActionIcon>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={() => setNewOpened(true)} aria-label="新增账户"><IconPlus size={22} /></ActionIcon>
          </>
        )}
      />
      <div className="page-body">
        <Stack gap="sm">
          <SummaryBar
            items={[
              { label: '资产', value: money(assets), className: 'income' },
              { label: '负债', value: money(liabilities), className: 'expense' },
              { label: '净资产', value: money(assets - liabilities) },
            ]}
          />

          {accounts.length === 0 ? (
            <div className="card empty-state">
              <Text size="sm" c="dimmed" mb="xs">还没有账户</Text>
              <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setNewOpened(true)}>新增账户</Button>
            </div>
          ) : (
            GROUPS.map((g) => {
              const list = accounts.filter((a) => a.type === g.type);
              if (list.length === 0) return null;
              const groupTotal = list.reduce((s, a) => s + a.balance, 0);
              return (
                <div key={g.type} className="card">
                  <div className="list-group-title">
                    <span>{g.label}</span>
                    <span className={groupTotal < 0 ? 'expense' : 'income'}>{money(groupTotal)}</span>
                  </div>
                  {list.map((a) => (
                    <Menu key={a.id} position="bottom-end" withinPortal shadow="md" width={160}>
                      <Menu.Target>
                        <button type="button" className="list-row">
                          <span className="dot" style={{ background: a.color }} />
                          <span className="list-row-main">{a.name}</span>
                          <b className={a.balance < 0 ? 'expense' : 'income'}>{money(a.balance)}</b>
                          <IconDotsVertical size={16} color="var(--mantine-color-gray-5)" />
                        </button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconList size={16} />} onClick={() => navigate(`/transactions?accounts=${a.id}`)}>查看记录</Menu.Item>
                        <Menu.Item leftSection={<IconScale size={16} />} onClick={() => setAdjusting(a)}>调整余额</Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => handleDelete(a)}>删除账户</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  ))}
                </div>
              );
            })
          )}
        </Stack>
      </div>

      <NewAccountModal opened={newOpened} onClose={() => setNewOpened(false)} onCreated={refreshAccounts} />

      <Modal opened={!!adjusting} onClose={() => setAdjusting(null)} title={<Text fw={700}>调整「{adjusting?.name}」余额</Text>} centered>
        {adjusting && <AdjustModal key={adjusting.id} account={adjusting} onClose={() => setAdjusting(null)} onAdjusted={refreshAccounts} />}
      </Modal>

      <TransactionDrawer
        opened={transfer.opened}
        onClose={() => setTransfer((t) => ({ ...t, opened: false }))}
        onSaved={refreshAccounts}
        defaultMode="transfer"
        defaultDate={todayStr()}
        formKey={transfer.key}
      />
    </>
  );
}
