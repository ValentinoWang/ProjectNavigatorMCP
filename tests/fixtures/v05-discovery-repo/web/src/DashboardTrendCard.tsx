export const DashboardTrendCard = ({ title, value }: { title: string; value: number }) => {
  return (
    <section>
      <h2>{title}</h2>
      <strong>{value}</strong>
    </section>
  );
};
