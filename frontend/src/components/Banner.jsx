const bannerLabels = {
  success: "Success",
  error: "Error",
  info: "Information",
  warning: "Warning",
};

export default function Banner({ type = "info", children, className = "" }) {
  return (
    <div className={`banner banner--${type} ${className}`.trim()} role={type === "error" ? "alert" : "status"}>
      <span className="banner__label">{bannerLabels[type] || bannerLabels.info}</span>
      <span>{children}</span>
    </div>
  );
}