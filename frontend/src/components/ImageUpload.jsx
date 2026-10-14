import { useEffect, useState } from "react";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxFileSize = 5 * 1024 * 1024;

export default function ImageUpload({ id, label, file, onChange, error }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selectedFile) return;
    if (!allowedTypes.has(selectedFile.type)) {
      setPreviewUrl("");
      onChange(null, "Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (selectedFile.size > maxFileSize) {
      setPreviewUrl("");
      onChange(null, "Image must be 5 MB or smaller.");
      return;
    }
    setPreviewUrl(URL.createObjectURL(selectedFile));
    onChange(selectedFile, "");
  }

  return (
    <div className="form-field image-upload">
      <span className="form-field__label" id={`${id}-label`}>{label}</span>
      {previewUrl ? (
        <div className="image-upload__preview">
          <img src={previewUrl} alt={`${label} preview`} />
          <div className="image-upload__details">
            <span>{file.name}</span>
            <button type="button" className="text-button" onClick={() => { setPreviewUrl(""); onChange(null, ""); }}>Remove image</button>
          </div>
        </div>
      ) : (
        <label className="upload-target" htmlFor={id}>
          <span className="upload-target__icon" aria-hidden="true">+</span>
          <span>Select an image</span>
          <small>JPG, PNG, or WebP · up to 5 MB</small>
        </label>
      )}
      <input
        className="visually-hidden"
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-labelledby={`${id}-label`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={handleFileChange}
      />
      {error && <p className="form-field__error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}