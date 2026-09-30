import React, { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import type { ImageType } from "../server/image-editor";

export function ImageUploadDialog(props: {
  source: string; hasLogo: boolean; busy: boolean; error: string; dialogRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void; onUpload: (type: ImageType, data: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [type, setType] = useState<ImageType>("Logo");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const busy = props.busy || reading;
  useEffect(() => {
    setReady(false);
    if (!file) { setPreview(undefined); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function choose(files: FileList | null) {
    if (busy || !files?.length) return;
    setError("");
    if (files.length !== 1) { setError("Choose one image at a time."); return; }
    const next = files[0];
    if (!/\.(png|jpe?g|webp|gif)$/i.test(next.name) || next.size > 10 * 1024 * 1024 || !next.size) {
      setError("Choose a PNG, JPEG, WebP, or GIF image no larger than 10 MB."); return;
    }
    setFile(next);
  }
  async function submit() {
    if (!file || !ready || busy) return;
    setReading(true); setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Unable to read this image.")); reader.readAsDataURL(file);
      });
      await props.onUpload(type, data);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setReading(false); }
  }
  return <div className="image-editor-overlay image-search-overlay" onClick={event => {
    event.stopPropagation(); if (event.target === event.currentTarget) props.onClose();
  }}>
    <div ref={props.dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="image-upload-title" className={`image-editor-modal image-upload-modal editor-source-${props.source}`}>
      <header><h2 id="image-upload-title">Upload image</h2><button aria-label="Close image upload" onClick={props.onClose}><X/></button></header>
      <p className="editor-notice">Choose an image from your device. PNG, JPEG, WebP, or GIF · up to 10 MB.</p>
      <div className={`image-upload-drop ${dragging ? "dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => {event.preventDefault(); setDragging(false); choose(event.dataTransfer.files);}}>
        {preview ? <img src={preview} alt="Upload preview" onLoad={() => setReady(true)} onError={() => {setReady(false); setError("This file could not be read as an image.");}}/> : <Upload aria-hidden="true"/>}
        <p>{file?.name ?? "Drag and drop an image here"}</p>
        <button className="editor-choose-file" disabled={busy} onClick={() => picker.current?.click()}>Choose file</button>
        <input ref={picker} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.gif" onChange={event => choose(event.target.files)} />
      </div>
      <label className="image-upload-type">Image type<select aria-label="Image type" value={type} disabled={busy} onChange={event => setType(event.target.value as ImageType)}><option value="Logo">Logo</option><option value="Backdrop">Backdrop</option></select></label>
      {(error || props.error) && <p className="editor-error" role="alert">{error || props.error}</p>}
      {busy && <p role="status">Uploading…</p>}
      <footer><button disabled={!file || !ready || busy} onClick={() => void submit()}><Upload/>{type === "Logo" && props.hasLogo ? "Replace" : "Add"}</button><button onClick={props.onClose}>Cancel</button></footer>
    </div>
  </div>;
}
