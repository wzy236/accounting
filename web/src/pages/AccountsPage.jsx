import { useState } from 'react';
import {
  ActionIcon, Button, Menu, Modal, NumberInput, SegmentedControl, Select, Stack, Text, TextInput,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconArrowsLeftRight, IconList, IconPencil, IconPlus, IconScale, IconTrash, IconDotsVertical,
} from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { confirmAction } from '../lib/confirm.jsx';
import { createAccount, updateAccount, deleteAccount, adjustAccountBalance } from '../lib/api.js';
import { CURRENCIES, HOME_CURRENCY } from '../lib/currency.js';
import { fmt, money, todayStr } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import ColorField from '../components/ColorField.jsx';
import TransactionDrawer from '../components/TransactionDrawer.jsx';
import { SummaryBar } from '../components/TransactionList.jsx';

const GROUPS = [
  { type: 'bank', label: '银行账户' },
  { type: 'credit_card', label: '信用卡' },
];

const duplicateMessage = (err) => (err.message?.includes('duplicate') ? '账户名已存在' : err.message);

function CurrencySelect({ value, onChange, description }) {
  return (
    <Select
      label="币种"
      description={description}
      data={CURRENCIES}
      value={value}
      onChange={(v) => onChange(v || HOME_CURRENCY)}
      allowDeselect={false}
      searchable
      comboboxProps={{ withinPortal: true }}
    />
  );
}

function NewAccountForm({ onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currency, setCurrency] = useState(HOME_CURRENCY);
  const [initialBalance, setInitialBalance] = useState(0);
  const [color, setColor] = useState('#2f7ee6');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await createAccount(client, { name: trimmed, type, initial_balance: Number(initialBalance) || 0, color, currency });
      showToast('已添加账户');
      onDone(true);
    } catch (err) {
      showToast('添加失败：' + duplicateMessage(err), true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput label="名称" placeholder="例如：招商银行储蓄卡" required value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        <SegmentedControl
          fullWidth
          data={[{ label: '银行账户', value: 'bank' }, { label: '信用卡', value: 'credit_card' }]}
          value={type}
          onChange={setType}
        />
        <CurrencySelect value={currency} onChange={setCurrency} description="外币账户的余额按这个币种显示，总资产按实时汇率折成 CAD" />
        <NumberInput
          label={`初始余额（${currency}）`}
          description="信用卡当前有欠款的话填负数，比如欠 2000 就填 -2000"
          value={initialBalance}
          onChange={setInitialBalance}
          decimalScale={2}
          thousandSeparator=","
          hideControls
          inputMode="decimal"
        />
        <ColorField value={color} onChange={setColor} />
        <Button type="submit" loading={saving}>添加账户</Button>
      </Stack>
    </form>
  );
}

function EditAccountForm({ account, onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [name, setName] = useState(account.name);
  const [color, setColor] = useState(account.color);
  const [currency, setCurrency] = useState(account.currency || HOME_CURRENCY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const fields = {};
    if (trimmed !== account.name) fields.name = trimmed;
    if (color !== account.color) fields.color = color;
    if (currency !== (account.currency || HOME_CURRENCY)) fields.currency = currency;
    if (Object.keys(fields).length === 0) {
      onDone(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateAccount(client, account.id, fields);
      showToast('已保存');
      onDone(true);
    } catch (err) {
      setError(duplicateMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput label="名称" required value={name} onChange={(e) => setName(e.target.value)} error={error} data-autofocus />
        <CurrencySelect
          value={currency}
          onChange={setCurrency}
          description="改币种不会换算已有金额：初始余额和以前的记录会按新币种重新理解"
        />
        <ColorField value={color} onChange={setColor} />
        <Button type="submit" loading={saving}>保存</Button>
      </Stack>
    </form>
  );
}

function AdjustForm({ account, onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [target, setTarget] = useState(Number(account.balance.toFixed(2)));
  const [saving, setSaving] = useState(false);
  const currency = account.currency || HOME_CURRENCY;

  async function handleSubmit(e) {
    e.preventDefault();
    if (target === '' || Number.isNaN(Number(target))) return;
    setSaving(true);
    try {
      const result = await adjustAccountBalance(client, account, Number(target));
      showToast(result ? '已调整余额' : '余额没有变化');
      onDone(true);
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
          label={`调整为（${currency}）`}
          value={target}
          onChange={setTarget}
          decimalScale={2}
          thousandSeparator=","
          hideControls
          inputMode="decimal"
          size="lg"
          styles={{ label: { fontSize: 'var(--mantine-font-size-sm)' } }}
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

  // modal: { kind: 'new' } | { kind: 'edit', account } | { kind: 'adjust', account }
  const [modal, setModal] = useState(null);
  const [modalKey, setModalKey] = useState(0);
  const [transfer, setTransfer] = useState({ opened: false, key: 0 });

  const openModal = (m) => {
    setModal(m);
    setModalKey((k) => k + 1);
  };
  const closeModal = (changed) => {
    setModal(null);
    if (changed) refreshAccounts();
  };

  // 合计都按 CAD 算：外币账户用 balance_cad（按实时汇率折算），汇率没取到的先不算进去
  const priced = accounts.filter((a) => a.balance_cad != null);
  const unpriced = accounts.length - priced.length;
  const assets = priced.filter((a) => a.balance_cad > 0).reduce((s, a) => s + a.balance_cad, 0);
  const liabilities = priced.filter((a) => a.balance_cad < 0).reduce((s, a) => s - a.balance_cad, 0);
  const hasForeign = accounts.some((a) => a.currency && a.currency !== HOME_CURRENCY);

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
  const modalTitle = modal?.kind === 'new' ? '新增账户'
    : modal?.kind === 'edit' ? `编辑「${modal.account.name}」`
      : modal?.kind === 'adjust' ? `调整「${modal.account.name}」余额` : '';

  return (
    <>
      <PageHeader
        title="账户"
        right={(
          <>
            <Button variant="light" size="sm" visibleFrom="sm" leftSection={<IconArrowsLeftRight size={16} />} onClick={openTransfer}>转账</Button>
            <Button size="sm" visibleFrom="sm" leftSection={<IconPlus size={16} />} onClick={() => openModal({ kind: 'new' })}>新增账户</Button>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={openTransfer} aria-label="转账"><IconArrowsLeftRight size={20} /></ActionIcon>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={() => openModal({ kind: 'new' })} aria-label="新增账户"><IconPlus size={22} /></ActionIcon>
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
          {hasForeign && (
            <Text size="xs" c="dimmed" mt={-4}>
              合计单位 CAD，外币账户按实时汇率折算
              {unpriced > 0 && `；有 ${unpriced} 个账户的汇率没取到，暂时没算进合计`}
            </Text>
          )}

          {accounts.length === 0 ? (
            <div className="card empty-state">
              <Text size="sm" c="dimmed" mb="xs">还没有账户</Text>
              <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => openModal({ kind: 'new' })}>新增账户</Button>
            </div>
          ) : (
            GROUPS.map((g) => {
              const list = accounts.filter((a) => a.type === g.type);
              if (list.length === 0) return null;
              const groupTotal = list.reduce((s, a) => s + (a.balance_cad ?? 0), 0);
              return (
                <div key={g.type} className="card">
                  <div className="list-group-title">
                    <span>{g.label}</span>
                    <span className={groupTotal < 0 ? 'expense' : 'income'}>{money(groupTotal)}</span>
                  </div>
                  {list.map((a) => {
                    const foreign = a.currency && a.currency !== HOME_CURRENCY;
                    return (
                      <Menu key={a.id} position="bottom-end" withinPortal shadow="md" width={170}>
                        <Menu.Target>
                          <button type="button" className="list-row">
                            <span className="dot" style={{ background: a.color }} />
                            <span className="list-row-main">
                              {a.name}
                              {foreign && a.balance_cad != null && (
                                <Text size="xs" c="dimmed" truncate>≈ {fmt(a.balance_cad)}</Text>
                              )}
                            </span>
                            <b className={a.balance < 0 ? 'expense' : 'income'}>
                              {money(a.balance)}
                              {foreign && <span className="ccy-code">{a.currency}</span>}
                            </b>
                            <IconDotsVertical size={16} color="var(--mantine-color-gray-5)" />
                          </button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconList size={16} />} onClick={() => navigate(`/transactions?accounts=${a.id}&range=all`)}>查看记录</Menu.Item>
                          <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => openModal({ kind: 'edit', account: a })}>编辑账户</Menu.Item>
                          <Menu.Item leftSection={<IconScale size={16} />} onClick={() => openModal({ kind: 'adjust', account: a })}>调整余额</Menu.Item>
                          <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => handleDelete(a)}>删除账户</Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    );
                  })}
                </div>
              );
            })
          )}
        </Stack>
      </div>

      <Modal opened={!!modal} onClose={() => closeModal(false)} title={<Text fw={700}>{modalTitle}</Text>} centered>
        {modal?.kind === 'new' && <NewAccountForm key={modalKey} onDone={closeModal} />}
        {modal?.kind === 'edit' && <EditAccountForm key={modalKey} account={modal.account} onDone={closeModal} />}
        {modal?.kind === 'adjust' && <AdjustForm key={modalKey} account={modal.account} onDone={closeModal} />}
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
