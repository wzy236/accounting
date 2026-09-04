import { useCallback, useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsForMonth, aggregateByCategory } from '../lib/api.js';
import { defaultMonth, fmt } from '../lib/format.js';

ChartJS.register(ArcElement, Tooltip, Legend);

function PieBlock({ title, data }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <section className="chart-card">
      <h2>{title} <span className="muted">（合计 {fmt(total)}）</span></h2>
      {data.length === 0 ? (
        <p className="empty">本月暂无记录</p>
      ) : (
        <Pie
          data={{
            labels: data.map((d) => d.name),
            datasets: [{ data: data.map((d) => d.total), backgroundColor: data.map((d) => d.color) }],
          }}
          options={{
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  label(ctx) {
                    const t = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = t ? ((ctx.parsed / t) * 100).toFixed(1) : '0.0';
                    return `${ctx.label}: ${fmt(ctx.parsed)} (${pct}%)`;
                  },
                },
              },
            },
          }}
        />
      )}
    </section>
  );
}

export default function ChartsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { ready } = useData();
  const [month, setMonth] = useState(defaultMonth());
  const [transactions, setTransactions] = useState([]);

  const reload = useCallback(async () => {
    try {
      setTransactions(await listTransactionsForMonth(client, month));
    } catch (e) {
      showToast('加载数据失败：' + e.message, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, month]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const expenseData = aggregateByCategory(transactions, 'expense');
  const incomeData = aggregateByCategory(transactions, 'income');

  return (
    <section>
      <div className="page-header">
        <h1>📊 统计图表</h1>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div className="chart-columns">
        <PieBlock title="支出分布" data={expenseData} />
        <PieBlock title="收入分布" data={incomeData} />
      </div>
    </section>
  );
}
