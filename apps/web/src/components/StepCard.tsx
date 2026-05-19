type StepCardProps = {
  index: number;
  title: string;
  description: string;
};

export function StepCard({ index, title, description }: StepCardProps) {
  return (
    <article className="card step-card">
      <p className="step-index">STEP {index}</p>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
    </article>
  );
}
