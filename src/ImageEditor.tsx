import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageUploadDialog } from "./ImageUpload";
import { Plus, ImagePlus, Search, Trash2, ArrowLeft, ArrowRight, X } from "lucide-react";
import type { EditorModel, EditorImage, ImageType } from "../server/image-editor";
import "./image-editor.css";

type Model = EditorModel & { id: string };
export function ImageEditorButton(props: { hidden?: boolean; source?: string; endpoint: string; mediaUrl: (url?: string) => string | undefined; onChanged: () => void }) {
  const source = props.source === "jellyfin" ? "jellyfin" : props.source === "navidrome" ? "local" : "external";
  const [model, setModel] = useState<Model>();
  const [results, setResults] = useState<EditorImage[]>();
  const [searchType, setSearchType] = useState<ImageType>();
  const [enlarged, setEnlarged] = useState<{url: string; label: string; image: EditorImage}>();
  const enlargedDialog = useRef<HTMLDivElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const uploadDialog = useRef<HTMLDivElement>(null);
  const closeUpload = () => {setUploadOpen(false); setError("");};
  const [previewVersion, setPreviewVersion] = useState(0);
  const searchDialog = useRef<HTMLDivElement>(null);
  const searchGeneration = useRef(0);
  const closeSearch = () => { searchGeneration.current++; setSearchType(undefined); setResults(undefined); setError(""); dialog.current?.focus(); };
  const closeTop = () => enlarged ? setEnlarged(undefined) : uploadOpen ? closeUpload() : searchType ? closeSearch() : close();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [openingError, setOpeningError] = useState("");
  const dialog = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const session = useRef<string | undefined>(undefined);
  const request = async (operation: string, body: Record<string, unknown> = {}) => {
    const url = new URL(props.endpoint, window.location.origin);
    url.pathname += "/" + operation;
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Image operation failed");
    return result;
  };
  const close = () => {
    const id = session.current; session.current = undefined;
    if (id) void request("close", { id }).catch(() => undefined);
    setModel(undefined); setEnlarged(undefined); setUploadOpen(false); setSearchType(undefined); setResults(undefined); searchGeneration.current++; setError(""); trigger.current?.focus(); props.onChanged();
  };
  useEffect(() => {
    if (!model) return;
    const activeDialog = enlarged ? enlargedDialog : uploadOpen ? uploadDialog : searchType ? searchDialog : dialog;
    activeDialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeTop(); }
      if (event.key === "Tab") {
        const nodes = activeDialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled):not([hidden]), [tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === activeDialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    const timer = window.setInterval(() => void request("heartbeat", {id: model.id}).catch(e => setError(e.message)), 10_000);
    return () => { window.removeEventListener("keydown", key, true); window.clearInterval(timer); };
  }, [model?.id, searchType, uploadOpen, enlarged]);
  useEffect(() => () => { if (session.current) void request("close", {id: session.current}).catch(() => undefined); }, []);
  async function open() {
    setBusy(true); setOpeningError("");
    try { const value = await request("open"); session.current = value.id; setModel(value); }
    catch (e) { setOpeningError(e instanceof Error ? e.message : "Unable to open image editor"); }
    finally { setBusy(false); }
  }
  async function search(type: ImageType) {
    setBusy(true); setError(""); setResults(undefined); setSearchType(type);
    const generation = ++searchGeneration.current;
    const id = model!.id;
    try { const result = await request("search", {id, type}); if (session.current === id && searchGeneration.current === generation) setResults(result.images); }
    catch (e) { if (session.current === id && searchGeneration.current === generation) setError(e instanceof Error ? e.message : "Search failed"); }
    finally { setBusy(false); }
  }
  async function mutate(action: string, image: EditorImage, direction?: number) {
    setBusy(true); setError("");
    const id = model!.id;
    try {
      const updated = await request("mutate", {id, revision: model!.revision, action, imageId: image.id, direction});
      if (session.current === id) {
        setModel({...updated, id}); setPreviewVersion(Date.now());
        if (action === "add" && image.type === "Logo") closeSearch();
      }
      props.onChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Edit failed";
      if (session.current === id) setError(message); else setOpeningError(message);
    }
    finally { setBusy(false); }
  }
  async function upload(type: ImageType, data: string) {
    const id = session.current;
    if (!id || !model) return;
    setBusy(true); setError("");
    try {
      const updated = await request("mutate", {id, revision: model.revision, action: "upload", type, data});
      if (session.current === id) {setModel({...updated, id}); setPreviewVersion(Date.now()); closeUpload();}
      props.onChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      if (session.current === id) setError(message); else setOpeningError(message);
    } finally { setBusy(false); }
  }
  function card(image: EditorImage, index: number, total: number, result = false) {
    const url = new URL(props.mediaUrl(image.url) ?? image.url, window.location.origin);
    if (!result && previewVersion) url.searchParams.set("mwpreview", String(previewVersion));
    return <article className="editor-image" key={image.id}>
      <button type="button" className={`editor-preview editor-preview-button ${image.type === "Logo" ? "logo" : ""}`} aria-label={`Enlarge ${image.type.toLowerCase()} ${index+1}`} onClick={() => setEnlarged({url: url.toString(), label: `${image.type} ${index+1}`, image})}><img src={url.toString()} alt={`${image.type} ${index+1}`} loading="lazy" onLoad={event => {
        if (!image.width || !image.height) {
          const node = event.currentTarget;
          node.closest("article")?.querySelector(".editor-resolution")?.replaceChildren(`${node.naturalWidth} × ${node.naturalHeight}`);
        }
      }}/></button>
      <strong>{image.type}{image.type === "Backdrop" ? ` ${index+1}` : ""}</strong>
      <span className="editor-resolution">{image.width && image.height ? `${image.width} × ${image.height}` : "Resolution unavailable"}</span>
      <span>{image.provider ?? "Provider unknown"}{image.language ? ` · ${image.language}` : ""}{image.rating !== undefined ? ` · Score ${image.rating}` : ""}</span>
      <div className="editor-image-actions">
        {result ? <button disabled={busy} onClick={() => void mutate("add", image)}>{image.type === "Backdrop" ? "Add backdrop" : "Use logo"}</button> : <>
          {image.type === "Backdrop" && <><button aria-label={`Move backdrop ${index+1} left`} disabled={busy || index === 0} onClick={() => void mutate("move", image, -1)}><ArrowLeft/></button><button aria-label={`Move backdrop ${index+1} right`} disabled={busy || index === total-1} onClick={() => void mutate("move", image, 1)}><ArrowRight/></button></>}
          <button className="editor-delete" aria-label={`Delete ${image.type.toLowerCase()} ${index+1}`} disabled={busy} onClick={() => void mutate("delete", image)}><Trash2/></button>
        </>}
      </div>
    </article>;
  }
  return <>
    {!props.hidden && props.source && props.source !== "fallback" && (<button ref={trigger} className={`image-editor-trigger editor-source-${source}`} title="Edit images" aria-label="Edit images" disabled={busy || !props.source || props.source === "fallback"} onClick={() => void open()}><ImagePlus/></button>)}
    {openingError && <span role="alert" className="editor-open-error" onClick={() => setOpeningError("")}>{openingError}</span>}
    {model && createPortal(<div className="image-editor-overlay" onClick={event => { if(event.target === event.currentTarget) closeTop(); }}>
      <div ref={dialog} inert={Boolean(searchType) || uploadOpen || Boolean(enlarged)} aria-hidden={Boolean(searchType) || uploadOpen || Boolean(enlarged)} tabIndex={-1} role="dialog" aria-modal={!searchType && !uploadOpen && !enlarged} aria-labelledby="image-editor-title" className={`image-editor-modal editor-source-${model.target.source}`}>
        <header><div><span className="editor-eyebrow">{model.target.source === "jellyfin" ? "Jellyfin library" : model.target.source === "local" ? "Local artist files" : "MediaWall artwork"}</span><h2 id="image-editor-title">{model.target.name}</h2><p>Manage images · {model.target.kind}</p></div><div className="editor-header-actions"><button disabled={busy} aria-label="Upload image" title="Upload image" onClick={() => {setError(""); setUploadOpen(true);}}><Plus/></button><button aria-label="Close image editor" onClick={close}><X/></button></div></header>
        <p className="editor-notice">Changes save immediately to {model.target.source === "jellyfin" ? "your Jellyfin server" : model.target.source === "local" ? "your local artwork files" : "MediaWall’s artist cache"}. MediaWall’s display timer is paused while this editor is open.</p>
        {error && !searchType && !uploadOpen && <p role="alert" className="editor-error">{error}</p>}
        {busy && <p role="status">Working…</p>}
        {(["Logo", "Backdrop"] as ImageType[]).map(type => { const images = model.images.filter(i => i.type === type); return <section key={type}><div className="editor-section-title"><h3>{type === "Logo" ? "Logo" : `Backdrops · ${images.length}`}</h3><button disabled={busy} onClick={() => void search(type)}><Search/> Search {type.toLowerCase()}</button></div><div className="editor-grid">{images.map((image,index) => card(image,index,images.length))}</div>{!images.length && <p className="editor-empty">{type === "Logo" ? "No logo. MediaWall uses its text fallback." : "No backdrops selected."}</p>}</section>; })}

        <footer><span>Edits are saved as you go.</span></footer>
      </div>
      {searchType && <div className="image-editor-overlay image-search-overlay" onClick={event => {
        event.stopPropagation(); if (event.target === event.currentTarget) closeSearch();
      }}>
        <div ref={searchDialog} inert={Boolean(enlarged)} aria-hidden={Boolean(enlarged)} tabIndex={-1} role="dialog" aria-modal={!enlarged} aria-labelledby="image-search-title" className={`image-editor-modal editor-source-${model.target.source}`}>
          <header><h2 id="image-search-title">Search {searchType.toLowerCase()}</h2><button aria-label="Close image search" onClick={closeSearch}><X/></button></header>
          <p className="editor-notice">{model.target.name} · {searchType === "Backdrop" ? "Add images to your existing backdrops." : "Choose a logo to replace the current one."}</p>
          {error && <p role="alert" className="editor-error">{error}</p>}
          {busy && <p role="status">Working…</p>}
          <div className="editor-grid">{results?.map((image,index) => card(image,index,results.length,true))}</div>
          {results?.length === 0 && <p>No images returned by the configured providers.</p>}
          <footer><span>Return to all image types.</span><button onClick={closeSearch}>Cancel</button></footer>
        </div>
      </div>}
      {enlarged && <div className="image-editor-overlay image-enlarged-overlay" onClick={event => {
        event.stopPropagation(); if (event.target === event.currentTarget) setEnlarged(undefined);
      }}>
        <div ref={enlargedDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="image-enlarged-title" className={`image-editor-modal image-enlarged-modal editor-source-${model.target.source}`}>
          <header><h2 id="image-enlarged-title">{enlarged.label}</h2><button aria-label="Close enlarged image" onClick={() => setEnlarged(undefined)}><X/></button></header>
          <div className={`image-enlarged-canvas ${enlarged.image.type === "Logo" ? "image-enlarged-logo" : ""}`}><img src={enlarged.url} alt={enlarged.label}/></div>
          <footer><span>{enlarged.image.width && enlarged.image.height ? `${enlarged.image.width} × ${enlarged.image.height} · ` : ""}{enlarged.image.provider ?? "Provider unknown"}</span><button onClick={() => setEnlarged(undefined)}>Close</button></footer>
        </div>
      </div>}
      {uploadOpen && <ImageUploadDialog source={model.target.source} busy={busy} error={error} dialogRef={uploadDialog} onClose={closeUpload} onUpload={upload}/>}
    </div>, document.body)}
  </>;
}
