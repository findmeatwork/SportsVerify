export default function FormField({ id, label, error, hint, children, className = "" }) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <label className="form-field__label" htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="form-field__hint">{hint}</p>}
      {error && <p className="form-field__error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}