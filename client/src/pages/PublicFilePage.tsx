import { trpc } from "@/lib/trpc";
import { ArrowLeft, Check, Copy, Download, FileAudio, FileImage, FileText, FileVideo, Link2, LockKeyhole, Share2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

function formatBytes(bytes: number) { if (!bytes) return "0 B"; const units = ["B", "KB", "MB", "GB"]; const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`; }
function icon(mime: string) { if (mime.startsWith("image/")) return <FileImage className="h-6 w-6" />; if (mime.startsWith("video/")) return <FileVideo className="h-6 w-6" />; if (mime.startsWith("audio/")) return <FileAudio className="h-6 w-6" />; return <FileText className="h-6 w-6" />; }

export default function PublicFilePage() {
  const { token = "" } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const fileQuery = trpc.files.publicByToken.useQuery({ token }, { retry: false });
  const file = fileQuery.data?.file;
  const url = fileQuery.data?.url;
  const share = async () => {
    const link = window.location.href;
    try { if (navigator.share) await navigator.share({ title: file?.name, text: "Shared securely via RedVault", url: link }); else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); toast.success("Link copied"); } } catch { /* share sheet dismissed */ }
  };
  const renderPreview = () => {
    if (!url || !file) return null;
    if (file.mimeType.startsWith("image/")) return <img className="public-preview-image" src={url} alt={file.name} />;
    if (file.mimeType.startsWith("video/")) return <video className="public-preview-media" src={url} controls playsInline />;
    if (file.mimeType.startsWith("audio/")) return <div className="audio-preview"><FileAudio className="h-10 w-10 text-red-400" /><audio src={url} controls /></div>;
    if (file.mimeType === "application/pdf") return <iframe className="public-preview-frame" src={url} title={file.name} />;
    if (file.mimeType.startsWith("text/")) return <iframe className="public-preview-frame text-frame" src={url} title={file.name} />;
    return <div className="generic-preview"><FileText className="h-12 w-12 text-red-400" /><span>Preview is not available for this file type.</span></div>;
  };
  return <div className="public-shell"><div className="public-nav"><button className="public-brand" onClick={() => setLocation("/")}><span className="brand-mark small"><span>R</span></span><strong>REDVAULT</strong></button><div className="public-nav-right"><span className="public-trust"><ShieldCheck className="h-3.5 w-3.5" /> Secure share</span><button className="ghost-btn" onClick={() => setLocation("/")}><ArrowLeft className="h-4 w-4" /> Back to vault</button></div></div><main className="public-main">{fileQuery.isLoading ? <div className="loading-screen"><div className="loading-orbit" /><span>Opening secure link...</span></div> : !file || !url ? <div className="public-error"><div className="public-error-icon"><Link2 className="h-7 w-7" /></div><h1>Link unavailable</h1><p>This file may have been removed or the link has expired. Ask the owner for a new public link.</p><button className="red-btn" onClick={() => setLocation("/")}>Return to RedVault</button></div> : <><div className="public-heading"><div className="public-file-icon">{icon(file.mimeType)}</div><div><div className="eyebrow"><Link2 className="h-3.5 w-3.5" /> Public view-only link</div><h1>{file.name}</h1><p>{formatBytes(file.sizeBytes)} · {file.downloads} downloads · Shared {new Date(file.createdAt).toLocaleDateString()}</p></div></div><div className="public-preview-card"><div className="preview-toolbar"><span><ShieldCheck className="h-4 w-4 text-emerald-400" /> Owner-enabled preview</span><span className="view-only"><LockKeyhole className="h-3.5 w-3.5" /> View only</span></div><div className="preview-stage">{renderPreview()}</div><div className="preview-actions"><a className="red-btn" href={url} download={file.name}><Download className="h-4 w-4" /> Download</a><button className="ghost-btn" onClick={share}>{copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}{copied ? "Copied" : "Share link"}</button><button className="icon-btn bordered" onClick={async () => { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }} title="Copy link"><Copy className="h-4 w-4" /></button></div></div><div className="public-footnote"><ShieldCheck className="h-4 w-4" /><span>This link is view/download-only. Uploaded files cannot be edited.</span></div></>}</main><footer className="public-footer"><span>© 2026 RedVault Share</span><span>Private by default · Secure by design</span></footer></div>;
}
