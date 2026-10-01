import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageUploadDialog } from "./ImageUpload";
import { Plus, ImagePlus, Search, Trash2, ArrowLeft, ArrowRight, X } from "lucide-react";
import type { EditorModel, EditorImage, ImageType, EditorSearchPage } from "../server/image-editor";
import "./image-editor.css";

type Model = EditorModel & { id: string };
type SearchState = EditorSearchPage & { type: ImageType; provider: string; allLanguages: boolean };
type Preview = { image: EditorImage; result: boolean; index: number };
export function ImageEditorButton(props: { hidden?: boolean; source?: string; endpoint: string; mediaUrl: (url?: string) => string | undefined; onChanged: () => void }) {
  const source = props.source === "jellyfin" ? "jellyfin" : props.source === "navidrome" ? "local" : "external";
  const [model, setModel] = useState<Model>();
  const [searchState, setSearchState] = useState<SearchState>();
  const [enlarged, setEnlarged] = useState<Preview>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [openingError, setOpeningError] = useState("");
  const dialog = useRef<HTMLDivElement>(null), searchDialog = useRef<HTMLDivElement>(null);
  const enlargedDialog = useRef<HTMLDivElement>(null), uploadDialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const session = useRef<string | undefined>(undefined);
  const searchGeneration = useRef(0), mutationInFlight = useRef(false), previewWanted = useRef(false);
  const layer = !model ? "closed" : enlarged ? "preview" : uploadOpen ? "upload" : searchState ? "search" : "main";
  const activeDialog = enlarged ? enlargedDialog : uploadOpen ? uploadDialog : searchState ? searchDialog : dialog;
  const request = async (operation: string, body: Record<string, unknown> = {}) => {
    const url = new URL(props.endpoint, window.location.origin); url.pathname += "/" + operation;
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Image operation failed");
    return result;
  };
  const closeSearch = () => { searchGeneration.current++; setSearchState(undefined); setError(""); if (!mutationInFlight.current) setBusy(false); };
  const closeUpload = () => { setUploadOpen(false); setError(""); };
  const close = () => {
    const id = session.current; session.current = undefined;
    if (id) void request("close", { id }).catch(() => undefined);
    searchGeneration.current++; setModel(undefined); setEnlarged(undefined); setUploadOpen(false); setSearchState(undefined); setError(""); setBusy(false);
    trigger.current?.focus(); props.onChanged();
  };
  const closePreview = () => { previewWanted.current = false; setEnlarged(undefined); };
  const closeTop = () => enlarged ? closePreview() : uploadOpen ? closeUpload() : searchState ? closeSearch() : close();
  // Changing a filter or finishing a request must not steal focus from its control.
  useLayoutEffect(() => {
    if (layer === "closed") return;
    const previous = document.activeElement as HTMLElement | null;
    activeDialog.current?.focus();
    return () => { requestAnimationFrame(() => { if (previous?.isConnected && !previous.closest("[inert]")) previous.focus(); }); };
  }, [layer]);
  useEffect(() => {
    if (!model) return;
    const timer = window.setInterval(() => void request("heartbeat", { id: model.id }).catch(e => setError(e.message)), 10_000);
    return () => window.clearInterval(timer);
  }, [model?.id]);
  useEffect(() => {
    if (!model) return;
    const key = (event: KeyboardEvent) => {
      // Keep MediaWall's display shortcuts out of all editor layers.
      event.stopImmediatePropagation();
      if (enlarged && ["ArrowLeft", "ArrowRight", "Enter", "Backspace"].includes(event.key)) {
        event.preventDefault();
        if (busy || event.repeat) return;
        if (event.key === "Backspace") void deleteEnlargedBackdrop();
        else if (event.key === "Enter") { if (enlarged.result) void mutate("add", enlarged.image); }
        else void navigateEnlarged(event.key === "ArrowLeft" ? -1 : 1);
      } else if (event.key === "Escape") { event.preventDefault(); closeTop(); }
      else if (event.key === "Tab") {
        const nodes = activeDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled):not([hidden]), [tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === activeDialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  useEffect(() => () => { if (session.current) void request("close", { id: session.current }).catch(() => undefined); }, []);
  async function open() {
    setBusy(true); setOpeningError("");
    try { const value = await request("open"); session.current = value.id; setModel(value); }
    catch (e) { setOpeningError(e instanceof Error ? e.message : "Unable to open image editor"); }
    finally { setBusy(false); }
  }
  async function search(type: ImageType, start = 0, provider = searchState?.provider ?? "", allLanguages = searchState?.allLanguages ?? false, previewEdge?: "first" | "last") {
    if (!model || mutationInFlight.current) return;
    setBusy(true); setError("");
    const generation = ++searchGeneration.current, id = model.id;
    const next: SearchState = {type, start, provider, allLanguages, images: [], total: 0, providers: searchState?.providers ?? [], supportsLanguageFilter: model.target.source === "jellyfin"};
    if (!previewEdge) setSearchState(next);
    try {
      const page: EditorSearchPage = await request("search", {id, type, start, provider, allLanguages});
      if (session.current !== id || generation !== searchGeneration.current) return;
      setSearchState({...next, ...page});
      if (previewEdge && page.images.length && previewWanted.current) {
        const index = previewEdge === "first" ? 0 : page.images.length - 1;
        setEnlarged({image: page.images[index], index, result: true});
      } else if (previewEdge) setEnlarged(undefined);
    } catch (e) { if (session.current === id && generation === searchGeneration.current) setError(e instanceof Error ? e.message : "Search failed"); }
    finally { if (session.current === id && generation === searchGeneration.current) setBusy(false); }
  }
  async function mutate(action: string, image: EditorImage, direction?: number) {
    if (!model || busy || mutationInFlight.current) return;
    mutationInFlight.current = true; setBusy(true); setError(""); const id = model.id;
    try {
      const updated = await request("mutate", {id, revision: model.revision, action, imageId: image.id, direction});
      if (session.current === id) {
        setModel({...updated, id}); setPreviewVersion(Date.now());
        if (action === "delete" && enlarged?.image.id === image.id) setEnlarged(undefined);
        if (action === "add") { setEnlarged(undefined); if (image.type === "Logo") closeSearch(); }
      }
      props.onChanged();
    } catch (e) { const message = e instanceof Error ? e.message : "Edit failed"; if (session.current === id) setError(message); else setOpeningError(message); }
    finally { mutationInFlight.current = false; setBusy(false); }
  }
  async function upload(type: ImageType, data: string) {
    const id = session.current;
    if (!id || !model || mutationInFlight.current) return;
    mutationInFlight.current = true; setBusy(true); setError("");
    try {
      const updated = await request("mutate", {id, revision: model.revision, action: "upload", type, data});
      if (session.current === id) { setModel({...updated, id}); setPreviewVersion(Date.now()); closeUpload(); }
      props.onChanged();
    } catch (e) { const message = e instanceof Error ? e.message : "Upload failed"; if (session.current === id) setError(message); else setOpeningError(message); }
    finally { mutationInFlight.current = false; setBusy(false); }
  }
  const hasLogo = Boolean(model?.images.some(image => image.type === "Logo"));
  const actionLabel = (type: ImageType) => type === "Logo" && hasLogo ? "Replace" : "Add";
  const enlargedImages = enlarged ? (enlarged.result ? searchState?.images ?? [] : model?.images ?? []).filter(image => image.type === enlarged.image.type) : [];
  const enlargedIndex = enlargedImages.findIndex(image => image.id === enlarged?.image.id);
  const previousPage = Boolean(enlarged?.result && searchState && searchState.start > 0);
  const nextPage = Boolean(enlarged?.result && searchState && searchState.start + searchState.images.length < searchState.total);
  async function navigateEnlarged(direction: number) {
    if (!enlarged || busy) return;
    const next = enlargedIndex + direction;
    if (next >= 0 && next < enlargedImages.length) setEnlarged({image: enlargedImages[next], index: next, result: enlarged.result});
    else if (searchState && enlarged.result && (direction < 0 ? previousPage : nextPage)) {
      await search(searchState.type, searchState.start + direction * 30, searchState.provider, searchState.allLanguages, direction < 0 ? "last" : "first");
    }
  }
  async function deleteEnlargedBackdrop() { if (enlarged && !enlarged.result && enlarged.image.type === "Backdrop") await mutate("delete", enlarged.image); }
  function imageUrl(image: EditorImage, result: boolean) {
    const url = new URL(props.mediaUrl(image.url) ?? image.url, window.location.origin);
    if (!result && previewVersion) url.searchParams.set("mwpreview", String(previewVersion));
    return url.toString();
  }
  const searchButton = (type: ImageType, label = `Search ${type.toLowerCase()}`) => <button className="editor-icon-button" disabled={busy} aria-label={label} title={label} onClick={() => void search(type, 0, "", false)}><Search/></button>;
  function card(image: EditorImage, index: number, total: number, result = false) {
    return <article className="editor-image" key={image.id}>
      <button type="button" className={`editor-preview editor-preview-button ${image.type === "Logo" ? "editor-logo-preview" : ""}`} aria-label={`Enlarge ${image.type.toLowerCase()} ${index + 1 + (result ? searchState?.start ?? 0 : 0)}`} onClick={() => { previewWanted.current = true; setEnlarged({image, index, result}); }}>
        <img src={imageUrl(image, result)} alt={`${image.type} ${index+1}`} loading="lazy" onLoad={event => {
          if (!image.width || !image.height) { const node = event.currentTarget; node.closest("article")?.querySelector(".editor-resolution")?.replaceChildren(`${node.naturalWidth} × ${node.naturalHeight}`); }
        }}/>
      </button>
      <div className="editor-card-footer">
        <div className="editor-card-description"><strong>{image.type}</strong><span className="editor-resolution">{image.width && image.height ? `${image.width} × ${image.height}` : "Dimensions unavailable"}</span>{result && <span>{image.provider ?? "Provider unknown"}{image.language ? ` · ${image.language}` : ""}</span>}</div>
        <div className="editor-card-actions">{result ? <button disabled={busy} onClick={() => void mutate("add", image)}>{actionLabel(image.type)}</button> : <>
          {searchButton(image.type)}<button className="editor-icon-button editor-delete" aria-label={`Delete ${image.type.toLowerCase()} ${index+1}`} title="Delete image" disabled={busy} onClick={() => void mutate("delete", image)}><Trash2/></button>
        </>}</div>
        {!result && image.type === "Backdrop" && <div className="editor-order-actions"><button className="editor-icon-button" aria-label={`Move backdrop ${index+1} left`} disabled={busy || index === 0} onClick={() => void mutate("move", image, -1)}><ArrowLeft/></button><button className="editor-icon-button" aria-label={`Move backdrop ${index+1} right`} disabled={busy || index === total-1} onClick={() => void mutate("move", image, 1)}><ArrowRight/></button></div>}
      </div>
    </article>;
  }
  const notice = model && `Edits save immediately to ${model.target.source === "jellyfin" ? "your Jellyfin server" : model.target.source === "local" ? "your local artwork files" : "your MediaWall Library"}.`;
  return <>
    {!props.hidden && props.source && props.source !== "fallback" && <button ref={trigger} className={`image-editor-trigger editor-source-${source}`} title="Edit images" aria-label="Edit images" disabled={busy} onClick={() => void open()}><ImagePlus/></button>}
    {openingError && <span role="alert" className="editor-open-error" onClick={() => setOpeningError("")}>{openingError}</span>}
    {model && createPortal(<div className="image-editor-overlay" onClick={event => { if (event.target === event.currentTarget) closeTop(); }}>
      <div ref={dialog} inert={layer !== "main"} aria-hidden={layer !== "main"} tabIndex={-1} role="dialog" aria-modal={layer === "main"} aria-labelledby="image-editor-title" className={`image-editor-modal editor-source-${model.target.source}`}>
        <header><h2 id="image-editor-title">Edit Images — {model.target.name}</h2><button aria-label="Close image editor" onClick={close}><X/></button></header>
        <p className="editor-notice">{notice}</p>
        {error && layer === "main" && <p role="alert" className="editor-error">{error}</p>}{busy && <p role="status">Working…</p>}
        <div className="editor-section-heading"><h3>Images</h3>{searchButton("Logo", "Search images")}<button className="editor-icon-button" disabled={busy} aria-label="Upload image" title="Upload image" onClick={() => {setError(""); setUploadOpen(true);}}><Plus/></button></div>
        <div className="editor-standard-grid">{model.images.filter(image => image.type === "Logo").map((image, index, images) => card(image, index, images.length))}</div>
        <section className="editor-backdrops"><div className="editor-section-heading"><h3>Backdrops</h3>{searchButton("Backdrop", "Search backdrops")}</div><div className="editor-grid">{model.images.filter(image => image.type === "Backdrop").map((image, index, images) => card(image, index, images.length))}</div></section>
      </div>
      {searchState && <div className="image-editor-overlay image-search-overlay" onClick={event => {event.stopPropagation(); if (event.target === event.currentTarget) closeSearch();}}>
        <div ref={searchDialog} inert={Boolean(enlarged)} aria-hidden={Boolean(enlarged)} tabIndex={-1} role="dialog" aria-modal={!enlarged} aria-labelledby="image-search-title" className={`image-editor-modal editor-source-${model.target.source}`}>
          <header><h2 id="image-search-title">Search images</h2><button aria-label="Close image search" onClick={closeSearch}><X/></button></header>
          <div className="editor-search-controls">
            <label>Source<select disabled={mutationInFlight.current} value={searchState.provider} onChange={event => void search(searchState.type, 0, event.target.value, searchState.allLanguages)}><option value="">All</option>{[...new Set([...searchState.providers, ...(searchState.provider ? [searchState.provider] : [])])].map(provider => <option key={provider} value={provider}>{provider}</option>)}</select></label>
            <label>Type<select disabled={mutationInFlight.current} value={searchState.type} onChange={event => void search(event.target.value as ImageType, 0, searchState.provider, searchState.allLanguages)}><option value="Logo">Logo</option><option value="Backdrop">Backdrop</option></select></label>
            <span className="editor-search-range" aria-live="polite">{busy ? "Loading…" : `${searchState.images.length ? searchState.start + 1 : 0}–${searchState.images.length ? searchState.start + searchState.images.length : 0} of ${searchState.total}`}</span>
            <button className="editor-icon-button" aria-label="Previous search page" disabled={busy || searchState.start === 0} onClick={() => void search(searchState.type, searchState.start - 30, searchState.provider, searchState.allLanguages)}><ArrowLeft/></button>
            <button className="editor-icon-button" aria-label="Next search page" disabled={busy || searchState.start + searchState.images.length >= searchState.total} onClick={() => void search(searchState.type, searchState.start + 30, searchState.provider, searchState.allLanguages)}><ArrowRight/></button>
            {searchState.supportsLanguageFilter && <label className="editor-all-languages"><input type="checkbox" disabled={mutationInFlight.current} checked={searchState.allLanguages} onChange={event => void search(searchState.type, 0, searchState.provider, event.target.checked)}/>All languages</label>}
          </div>
          {error && !enlarged && <p role="alert" className="editor-error">{error}</p>}{busy && <p role="status">Working…</p>}
          <div className="editor-grid">{searchState.images.map((image,index) => card(image,index,searchState.images.length,true))}</div>
          {!busy && !searchState.images.length && <p>No images found.</p>}
          <footer><button onClick={closeSearch}>Cancel</button></footer>
        </div>
      </div>}
      {enlarged && <div className="image-editor-overlay image-enlarged-overlay" onClick={event => {event.stopPropagation(); if (event.target === event.currentTarget) closePreview();}}>
        <div ref={enlargedDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="image-enlarged-title" className={`image-editor-modal image-enlarged-modal editor-source-${model.target.source}`}>
          <header><h2 id="image-enlarged-title">{enlarged.image.type}</h2><button aria-label="Close enlarged image" onClick={closePreview}><X/></button></header>
          {error && <p role="alert" className="editor-error">{error}</p>}{busy && <p role="status">Working…</p>}
          <div className="image-enlarged-viewer">
            {(enlargedImages.length > 1 || previousPage || nextPage) && <button aria-label="Previous image" disabled={busy || (enlargedIndex <= 0 && !previousPage)} onClick={() => void navigateEnlarged(-1)}><ArrowLeft/></button>}
            <div className={`image-enlarged-canvas ${enlarged.image.type === "Logo" ? "image-enlarged-logo" : ""}`}><img src={imageUrl(enlarged.image,enlarged.result)} alt={enlarged.image.type}/></div>
            {(enlargedImages.length > 1 || previousPage || nextPage) && <button aria-label="Next image" disabled={busy || (enlargedIndex >= enlargedImages.length-1 && !nextPage)} onClick={() => void navigateEnlarged(1)}><ArrowRight/></button>}
          </div>
          <footer><span>{enlargedIndex+1+(enlarged.result ? searchState?.start ?? 0 : 0)} / {enlarged.result ? searchState?.total : enlargedImages.length}{enlarged.image.width && enlarged.image.height ? ` · ${enlarged.image.width} × ${enlarged.image.height}` : ""}</span><div className="editor-card-actions">{!enlarged.result && enlarged.image.type === "Backdrop" && <button className="editor-delete" disabled={busy} title="Delete backdrop (Backspace)" onClick={() => void deleteEnlargedBackdrop()}><Trash2/>Delete backdrop</button>}{enlarged.result && <button disabled={busy} onClick={() => void mutate("add", enlarged.image)}>{actionLabel(enlarged.image.type)}</button>}<button onClick={closePreview}>Close</button></div></footer>
        </div>
      </div>}
      {uploadOpen && <ImageUploadDialog source={model.target.source} hasLogo={hasLogo} busy={busy} error={error} dialogRef={uploadDialog} onClose={closeUpload} onUpload={upload}/>}
    </div>, document.body)}
  </>;
}
