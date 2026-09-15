import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Activity, Archive, ArrowUpRight, AudioLines, Check, ChevronDown, ChevronRight, Clipboard, Cloud, Copy, Download, FileArchive, FileAudio, FileImage, FileText, FileVideo, Folder, FolderPlus, HardDrive, LayoutDashboard, Link2, LockKeyhole, LogOut, Menu, MoreHorizontal, Play, Plus, Search, Settings2, ShieldCheck, Share2, Sparkles, Trash2, UploadCloud, Users, X, Zap,
} from "lucide-react";

type FileRow = { id: number; name: string; mimeType: string; sizeBytes: number; visibility: "public" | "private"; downloads: number; createdAt: Date | string; publicToken?: string | null; roomId?: number | null; folderId?: number | null };
type FolderRow = { id: number; name: string; roomId?: number | null; parentId?: number | null; createdAt: Date | string };
type RoomRow = { id: number; roomCode: string; name: string; createdAt: Date | string };

const demoFiles: FileRow[] = [
  { id: 1, name: "Brand-system-v4.pdf", mimeType: "application/pdf", sizeBytes: 18400000, visibility: "public", downloads: 38, createdAt: "2026-09-15T13:12:00Z", publicToken: "demo-brand-system" },
  { id: 2, name: "Launch-film-final.mp4", mimeType: "video/mp4", sizeBytes: 248000000, visibility: "private", downloads: 12, createdAt: "2026-09-14T18:04:00Z", roomId: 1 },
  { id: 3, name: "Product-shot-hero.png", mimeType: "image/png", sizeBytes: 6200000, visibility: "public", downloads: 91, createdAt: "2026-09-13T09:30:00Z", publicToken: "demo-product-shot" },
  { id: 4, name: "Q3-audio-notes.m4a", mimeType: "audio/mp4", sizeBytes: 7200000, visibility: "private", downloads: 4, createdAt: "2026-09-12T16:50:00Z" },
  { id: 5, name: "Engineering-brief.txt", mimeType: "text/plain", sizeBytes: 46000, visibility: "private", downloads: 9, createdAt: "2026-09-10T12:20:00Z" },
];
const demoFolders: FolderRow[] = [
  { id: 1, name: "Launch assets", createdAt: "2026-09-13T09:00:00Z" },
  { id: 2, name: "Client handoff", createdAt: "2026-09-08T09:00:00Z" },
  { id: 3, name: "Archive / 2026", createdAt: "2026-08-30T09:00:00Z" },
];
const demoRooms: RoomRow[] = [
  { id: 1, name: "Northstar launch room", roomCode: "RV-NORTH7", createdAt: "2026-09-12T08:20:00Z" },
  { id: 2, name: "Video production", roomCode: "RV-MOTION2", createdAt: "2026-08-28T11:10:00Z" },
];

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
function initials(name?: string | null) {
  return (name || "Guest").split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}
function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5" />;
  if (mimeType.startsWith("video/")) return <FileVideo className="h-5 w-5" />;
  if (mimeType.startsWith("audio/")) return <FileAudio className="h-5 w-5" />;
  if (mimeType.includes("pdf") || mimeType.startsWith("text/")) return <FileText className="h-5 w-5" />;
  if (mimeType.includes("zip")) return <FileArchive className="h-5 w-5" />;
  return <Archive className="h-5 w-5" />;
}

function EmptyState({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{copy}</p></div>;
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [section, setSection] = useState("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "public" | "private">("all");
  const [sort, setSort] = useState<"recent" | "name" | "size">("recent");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinSecret, setJoinSecret] = useState("");
  const [fileVisibility, setFileVisibility] = useState<"public" | "private">("private");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [roomCredentials, setRoomCredentials] = useState<{ roomCode: string; secret: string } | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const overviewInput = useMemo(() => ({ search: search || undefined }), [search]);
  const overviewQuery = trpc.dashboard.overview.useQuery(overviewInput, { enabled: isAuthenticated, refetchOnWindowFocus: false });
  const createRoom = trpc.rooms.create.useMutation({ onSuccess: (data) => { setRoomCredentials(data); overviewQuery.refetch(); toast.success("Private room created"); }, onError: (error) => toast.error(error.message) });
  const createFolder = trpc.dashboard.createFolder.useMutation({ onSuccess: () => { setNewFolderOpen(false); setFolderName(""); overviewQuery.refetch(); toast.success("Folder created"); }, onError: (error) => toast.error(error.message) });
  const renameFolder = trpc.dashboard.renameFolder.useMutation({ onSuccess: () => { overviewQuery.refetch(); toast.success("Folder renamed"); }, onError: (error) => toast.error(error.message) });
  const deleteFolder = trpc.dashboard.deleteFolder.useMutation({ onSuccess: () => { overviewQuery.refetch(); toast.success("Folder deleted"); }, onError: (error) => toast.error(error.message) });
  const uploadFile = trpc.files.upload.useMutation({ onSuccess: (data) => { setUploadOpen(false); setUploading(false); setUploadProgress(100); overviewQuery.refetch(); toast.success(data.publicToken ? "Public link created" : "File uploaded securely"); }, onError: (error) => { setUploading(false); toast.error(error.message); } });
  const roomAccess = trpc.rooms.access.useQuery({ roomCode: joinCode, secret: joinSecret }, { enabled: false });
  const previewQuery = trpc.files.access.useQuery({ id: previewFile?.id ?? 1 }, { enabled: Boolean(previewFile && isAuthenticated), retry: false });

  const data = overviewQuery.data;
  const files = ((data?.files as FileRow[] | undefined) ?? (isAuthenticated ? [] : demoFiles));
  const folders = ((data?.folders as FolderRow[] | undefined) ?? (isAuthenticated ? [] : demoFolders));
  const rooms = ((data?.rooms as RoomRow[] | undefined) ?? (isAuthenticated ? [] : demoRooms));
  const stats = data?.stats ?? { totalBytes: 368000000, fileCount: 24, publicCount: 8, roomCount: 2 };
  const filteredFiles = files.filter((file) => {
    const matchesFilter = filter === "all" || file.visibility === filter;
    const matchesSearch = !search || file.name.toLowerCase().includes(search.toLowerCase()) || file.mimeType.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "size" ? b.sizeBytes - a.sizeBytes : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const copyText = async (text: string, message = "Copied to clipboard") => {
    try { await navigator.clipboard.writeText(text); toast.success(message); } catch { toast.error("Clipboard access is unavailable"); }
  };
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!isAuthenticated) { toast("Sign in to upload files", { action: { label: "Sign in", onClick: () => startLogin() } }); return; }
    if (selected.size > 250 * 1024 * 1024) { toast.error("Files must be smaller than 250 MB"); return; }
    setUploading(true); setUploadProgress(12);
    const reader = new FileReader();
    reader.onprogress = (progressEvent) => { if (progressEvent.lengthComputable) setUploadProgress(Math.max(12, Math.round((progressEvent.loaded / progressEvent.total) * 80))); };
    reader.onload = () => {
      const result = String(reader.result || "");
      const dataBase64 = result.split(",")[1] || "";
      setUploadProgress(88);
      uploadFile.mutate({ name: selected.name, mimeType: selected.type || "application/octet-stream", sizeBytes: selected.size, dataBase64, visibility: fileVisibility });
    };
    reader.onerror = () => { setUploading(false); toast.error("Could not read that file"); };
    reader.readAsDataURL(selected);
  };
  const createRoomNow = () => {
    if (!roomName.trim()) return toast.error("Give your room a name");
    if (!isAuthenticated) return toast("Sign in to create a private room", { action: { label: "Sign in", onClick: () => startLogin() } });
    createRoom.mutate({ name: roomName });
  };
  const createFolderNow = () => {
    if (!folderName.trim()) return toast.error("Give your folder a name");
    if (!isAuthenticated) return toast("Sign in to manage folders", { action: { label: "Sign in", onClick: () => startLogin() } });
    createFolder.mutate({ name: folderName });
  };
  const joinRoomNow = async () => {
    if (!joinCode.trim() || !joinSecret.trim()) return toast.error("Enter both the room ID and secret");
    try { const result = await roomAccess.refetch(); if (result.data) { toast.success(`Unlocked ${result.data.room.name}`); setJoinOpen(false); } } catch { toast.error("That room ID or secret is not valid"); }
  };

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "files", label: "All files", icon: Archive, count: stats.fileCount },
    { id: "public", label: "Public links", icon: Link2, count: stats.publicCount },
    { id: "rooms", label: "Private rooms", icon: LockKeyhole, count: stats.roomCount },
    { id: "folders", label: "Folders", icon: Folder, count: folders.length },
  ];

  return <div className="app-shell">
    <aside className={`app-sidebar ${mobileNav ? "mobile-open" : ""}`}>
      <div className="brand-lockup"><div className="brand-mark"><span>R</span></div><div><div className="brand-name">REDVAULT</div><div className="brand-sub">SECURE FILE EXCHANGE</div></div><button className="mobile-close" onClick={() => setMobileNav(false)}><X className="h-5 w-5" /></button></div>
      <div className="workspace-switcher"><div className="workspace-dot" /><div><div className="workspace-label">Workspace</div><div className="workspace-name">{user?.name ? `${user.name}'s vault` : "Personal vault"}</div></div><ChevronDown className="h-4 w-4 ml-auto text-white/35" /></div>
      <div className="side-label">Workspace</div>
      <nav className="side-nav">{navItems.map((item) => <button key={item.id} className={`side-nav-item ${section === item.id ? "active" : ""}`} onClick={() => { setSection(item.id); setMobileNav(false); }}><item.icon className="h-[18px] w-[18px]" /><span>{item.label}</span>{item.count !== undefined && <span className="nav-count">{item.count}</span>}</button>)}</nav>
      <div className="side-divider" />
      <div className="side-label">Security</div>
      <nav className="side-nav"><button className="side-nav-item" onClick={() => toast("Security controls are active for every private room")}><ShieldCheck className="h-[18px] w-[18px]" /><span>Security center</span></button><button className="side-nav-item" onClick={() => toast("Usage settings coming soon")}><Settings2 className="h-[18px] w-[18px]" /><span>Settings</span></button>{user?.role === "admin" && <button className={`side-nav-item ${section === "admin" ? "active" : ""}`} onClick={() => { setSection("admin"); setMobileNav(false); }}><Activity className="h-[18px] w-[18px]" /><span>Admin console</span></button>}</nav>
      <div className="sidebar-bottom"><div className="storage-mini"><div className="storage-mini-top"><span>Storage used</span><strong>{formatBytes(stats.totalBytes)}</strong></div><div className="progress-track"><span style={{ width: `${Math.min(100, (stats.totalBytes / (2 * 1024 * 1024 * 1024)) * 100)}%` }} /></div><div className="storage-mini-bottom"><span>of 2 GB</span><span className="storage-percent">{Math.round((stats.totalBytes / (2 * 1024 * 1024 * 1024)) * 100)}%</span></div></div><div className="profile-row"><div className="avatar">{initials(user?.name)}</div><div className="profile-copy"><strong>{user?.name || "Guest preview"}</strong><span>{user?.email || "Sign in to sync"}</span></div>{isAuthenticated ? <button className="icon-btn" onClick={() => logout()} title="Sign out"><LogOut className="h-4 w-4" /></button> : <button className="profile-signin" onClick={() => startLogin()}>Sign in</button>}</div></div>
    </aside>

    <main className="app-main">
      <header className="topbar"><div className="mobile-brand"><button className="icon-btn" onClick={() => setMobileNav(true)}><Menu className="h-5 w-5" /></button><div className="brand-mark small"><span>R</span></div><strong>REDVAULT</strong></div><div className="topbar-search"><Search className="h-4 w-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files, folders, rooms..." /><kbd>⌘ K</kbd></div><div className="topbar-actions"><button className="icon-btn" onClick={() => toast("You are all caught up")}><Activity className="h-[18px] w-[18px]" /><span className="notification-dot" /></button><button className="user-pill" onClick={() => isAuthenticated ? setSection("overview") : startLogin()}><span className="avatar tiny">{initials(user?.name)}</span><span className="user-pill-name">{user?.name?.split(" ")[0] || "Guest"}</span><ChevronDown className="h-3.5 w-3.5 text-white/35" /></button></div></header>
      <div className="page-wrap">
        {loading ? <div className="loading-screen"><div className="loading-orbit" /><span>Unlocking your vault...</span></div> : <>
          <section className="page-heading"><div><div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> {isAuthenticated ? "Private workspace" : "Preview workspace"}</div><h1>{section === "overview" ? "Your files, under control." : navItems.find((item) => item.id === section)?.label || "Admin console"}</h1><p>{section === "overview" ? "Move fast with a secure home for every file, link and collaboration room." : "Everything you need to keep your file exchange organized."}</p></div><div className="heading-actions"><button className="ghost-btn" onClick={() => setJoinOpen(true)}><LockKeyhole className="h-4 w-4" /> Join room</button><button className="red-btn" onClick={() => setUploadOpen(true)}><UploadCloud className="h-4 w-4" /> Upload files</button></div></section>
          {section === "admin" ? <AdminPanel /> : section === "rooms" ? <RoomsSection rooms={rooms} onCreate={() => setRoomOpen(true)} onJoin={() => setJoinOpen(true)} onCopy={(code) => copyText(code, "Room ID copied")} /> : section === "folders" ? <FoldersSection folders={folders} onCreate={() => setNewFolderOpen(true)} onRename={(id: number, name: string) => renameFolder.mutate({ id, name })} onDelete={(id: number) => deleteFolder.mutate({ id })} /> : <>
            {section === "overview" && <section className="stats-grid"><StatCard icon={<HardDrive />} label="Total storage" value={formatBytes(stats.totalBytes)} detail="of 2 GB available" accent="red" /><StatCard icon={<Archive />} label="All files" value={String(stats.fileCount)} detail="Across your workspace" /><StatCard icon={<Link2 />} label="Public links" value={String(stats.publicCount)} detail="Ready to share" accent="amber" /><StatCard icon={<LockKeyhole />} label="Private rooms" value={String(stats.roomCount)} detail="Encrypted access" accent="violet" /></section>}
            <section className="content-grid"><div className="panel files-panel"><div className="panel-header"><div><h2>{section === "public" ? "Public links" : section === "files" ? "All files" : "Recent files"}</h2><p>{section === "public" ? "Shareable links with view-only access." : "Your latest uploads and shared assets."}</p></div><div className="panel-tools"><div className="select-wrap"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">Recent</option><option value="name">Name</option><option value="size">Size</option></select><ChevronDown className="h-3.5 w-3.5" /></div><button className="icon-btn bordered" onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4" /></button></div></div><div className="filter-row"><button className={filter === "all" ? "filter-chip active" : "filter-chip"} onClick={() => setFilter("all")}>All files</button><button className={filter === "public" ? "filter-chip active" : "filter-chip"} onClick={() => setFilter("public")}><Link2 className="h-3.5 w-3.5" /> Public</button><button className={filter === "private" ? "filter-chip active" : "filter-chip"} onClick={() => setFilter("private")}><LockKeyhole className="h-3.5 w-3.5" /> Private</button></div><div className="file-list">{filteredFiles.filter((file) => section !== "public" || file.visibility === "public").slice(0, 8).map((file, index) => <FileItem key={file.id} file={file} index={index} onCopy={() => copyText(file.publicToken ? `${window.location.origin}/s/${file.publicToken}` : "Private files can only be shared inside a room", "Link copied")} onPreview={() => setPreviewFile(file)} onDownload={() => toast("Download links are generated securely on request")} />)}</div>{!filteredFiles.length && <EmptyState icon={<Archive />} title="No files yet" copy="Upload your first asset to start building your vault." />}<div className="panel-footer"><span>Showing {Math.min(filteredFiles.length, 8)} of {filteredFiles.length} files</span><button onClick={() => setSection("files")}>View all <ArrowUpRight className="h-3.5 w-3.5" /></button></div></div><div className="right-stack"><div className="panel quick-panel"><div className="panel-header compact"><div><h2>Quick actions</h2><p>Common moves, one tap away.</p></div><Zap className="h-5 w-5 text-red-400" /></div><div className="quick-actions"><QuickAction icon={<UploadCloud />} label="Upload a file" copy="Add to your vault" onClick={() => setUploadOpen(true)} /><QuickAction icon={<LockKeyhole />} label="Create private room" copy="Invite with a secret" onClick={() => setRoomOpen(true)} /><QuickAction icon={<FolderPlus />} label="New folder" copy="Keep files tidy" onClick={() => setNewFolderOpen(true)} /></div></div><div className="panel security-panel"><div className="security-glow" /><div className="security-icon"><ShieldCheck className="h-5 w-5" /></div><div><h3>Vault protected</h3><p>Private files stay private. Access is checked server-side on every request.</p></div><span className="secure-badge"><Check className="h-3 w-3" /> Active</span></div></div></section>
            {section === "overview" && <section className="lower-grid"><div className="panel folder-panel"><div className="panel-header compact"><div><h2>Folders</h2><p>Your organized spaces.</p></div><button className="text-btn" onClick={() => setNewFolderOpen(true)}>New folder <Plus className="h-3.5 w-3.5" /></button></div><div className="folder-grid">{folders.slice(0, 4).map((folder) => <button className="folder-card" key={folder.id} onClick={() => toast(`Opening ${folder.name}`)}><div className="folder-symbol"><Folder className="h-5 w-5" /></div><div className="folder-card-copy"><strong>{folder.name}</strong><span>Folder · {formatDate(folder.createdAt)}</span></div><MoreHorizontal className="h-4 w-4 text-white/30 ml-auto" /></button>)}</div></div><div className="panel room-panel"><div className="panel-header compact"><div><h2>Private rooms</h2><p>Secure collaboration spaces.</p></div><button className="text-btn" onClick={() => setRoomOpen(true)}>New room <Plus className="h-3.5 w-3.5" /></button></div><div className="room-list">{rooms.slice(0, 2).map((room) => <button className="room-row" key={room.id} onClick={() => copyText(room.roomCode, "Room ID copied")}><div className="room-avatar"><Users className="h-4 w-4" /></div><div className="room-copy"><strong>{room.name}</strong><span>{room.roomCode} · {formatDate(room.createdAt)}</span></div><Copy className="h-4 w-4 text-white/30 ml-auto" /></button>)}</div></div></section>}
          </>}
        </>}
      </div>
    </main>

    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close menu" />}
    {uploadOpen && <Modal title="Upload to your vault" copy="Files are stored in encrypted object storage. You can share them publicly or keep them private." onClose={() => { if (!uploading) setUploadOpen(false); }}><div className="visibility-toggle"><button className={fileVisibility === "private" ? "active" : ""} onClick={() => setFileVisibility("private")}><LockKeyhole className="h-4 w-4" /><span><strong>Private</strong><small>Only you or room members</small></span></button><button className={fileVisibility === "public" ? "active" : ""} onClick={() => setFileVisibility("public")}><Link2 className="h-4 w-4" /><span><strong>Public link</strong><small>Anyone with the link can view</small></span></button></div><button className="dropzone" onClick={() => fileInputRef.current?.click()} disabled={uploading}><UploadCloud className="h-8 w-8 text-red-400" /><strong>{uploading ? "Uploading securely..." : "Choose a file"}</strong><span>Images, video, audio, PDF, text · up to 250 MB</span><input ref={fileInputRef} type="file" hidden onChange={handleUpload} />{uploading && <div className="upload-progress"><div className="progress-track"><span style={{ width: `${uploadProgress}%` }} /></div><small>{uploadProgress}% uploaded</small></div>}</button>{!isAuthenticated && <div className="modal-note"><ShieldCheck className="h-4 w-4" /> Sign in is required to persist uploads to your vault.</div>}</Modal>}
    {roomOpen && <Modal title="Create a private room" copy="Give collaborators a room ID and secret. Files inside will never appear in public search." onClose={() => { setRoomOpen(false); setRoomCredentials(null); }}>{roomCredentials ? <div className="credentials-card"><div className="credential-row"><span>Room ID</span><strong>{roomCredentials.roomCode}</strong><button className="icon-btn" onClick={() => copyText(roomCredentials.roomCode)}><Copy className="h-4 w-4" /></button></div><div className="credential-row"><span>Secret code</span><strong>{roomCredentials.secret}</strong><button className="icon-btn" onClick={() => copyText(roomCredentials.secret)}><Copy className="h-4 w-4" /></button></div><button className="red-btn full" onClick={() => { copyText(`Room ID: ${roomCredentials.roomCode}\nSecret: ${roomCredentials.secret}`, "Credentials copied"); setRoomOpen(false); }}>Copy credentials <Clipboard className="h-4 w-4" /></button></div> : <><label className="field-label">Room name<input className="text-input" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="e.g. Northstar launch room" /></label><button className="red-btn full" onClick={createRoomNow} disabled={createRoom.isPending}>{createRoom.isPending ? "Creating..." : "Create room"}<ArrowUpRight className="h-4 w-4" /></button></>}</Modal>}
    {joinOpen && <Modal title="Join a private room" copy="Enter the room ID and secret shared with you. We never expose room contents publicly." onClose={() => setJoinOpen(false)}><label className="field-label">Room ID<input className="text-input uppercase" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="RV-XXXXXXX" /></label><label className="field-label">Secret code<input className="text-input" value={joinSecret} onChange={(event) => setJoinSecret(event.target.value)} placeholder="6-character secret" /></label><button className="red-btn full" onClick={joinRoomNow} disabled={roomAccess.isFetching}>{roomAccess.isFetching ? "Checking access..." : "Unlock room"}<LockKeyhole className="h-4 w-4" /></button></Modal>}
    {newFolderOpen && <Modal title="Create a folder" copy="Folders help you keep projects and handoffs easy to find." onClose={() => setNewFolderOpen(false)}><label className="field-label">Folder name<input className="text-input" value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="e.g. Client handoff" /></label><button className="red-btn full" onClick={createFolderNow} disabled={createFolder.isPending}>{createFolder.isPending ? "Creating..." : "Create folder"}<FolderPlus className="h-4 w-4" /></button></Modal>}
    {previewFile && <FilePreviewModal file={previewFile} url={previewQuery.data?.url} loading={previewQuery.isLoading} onClose={() => setPreviewFile(null)} />}
  </div>;
}

function StatCard({ icon, label, value, detail, accent = "blue" }: { icon: React.ReactNode; label: string; value: string; detail: string; accent?: string }) { return <div className={`stat-card accent-${accent}`}><div className="stat-top"><div className="stat-icon">{icon}</div><span className="stat-trend"><ArrowUpRight className="h-3.5 w-3.5" /></span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>; }
function QuickAction({ icon, label, copy, onClick }: { icon: React.ReactNode; label: string; copy: string; onClick: () => void }) { return <button className="quick-action" onClick={onClick}><div className="quick-icon">{icon}</div><div><strong>{label}</strong><span>{copy}</span></div><ChevronRight className="h-4 w-4 text-white/25 ml-auto" /></button>; }
function FileItem({ file, index, onCopy, onPreview, onDownload }: { file: FileRow; index: number; onCopy: () => void; onPreview: () => void; onDownload: () => void }) { return <div className="file-item" style={{ animationDelay: `${index * 35}ms` }}><div className={`file-type ${file.mimeType.split("/")[0]}`}>{fileIcon(file.mimeType)}</div><div className="file-copy"><strong>{file.name}</strong><span>{formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}</span></div><div className={`visibility-badge ${file.visibility}`}><span />{file.visibility === "public" ? "Public" : "Private"}</div><span className="download-count"><Download className="h-3.5 w-3.5" />{file.downloads}</span><div className="file-actions"><button className="icon-btn" title="Preview" onClick={onPreview}><Play className="h-4 w-4" /></button>{file.visibility === "public" && <button className="icon-btn" title="Copy link" onClick={onCopy}><Share2 className="h-4 w-4" /></button>}<button className="icon-btn" title="Download" onClick={onDownload}><Download className="h-4 w-4" /></button></div></div>; }
function Modal({ title, copy, onClose, children }: { title: string; copy: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-layer"><div className="modal-card"><button className="modal-close" onClick={onClose}><X className="h-4 w-4" /></button><div className="modal-kicker"><Sparkles className="h-3.5 w-3.5" /> Redvault action</div><h2>{title}</h2><p>{copy}</p><div className="modal-body">{children}</div></div></div>; }
function FilePreviewModal({ file, url, loading, onClose }: { file: FileRow; url?: string; loading: boolean; onClose: () => void }) { const preview = url && file.mimeType.startsWith("image/") ? <img className="public-preview-image" src={url} alt={file.name} /> : url && file.mimeType.startsWith("video/") ? <video className="public-preview-media" src={url} controls playsInline /> : url && file.mimeType.startsWith("audio/") ? <div className="audio-preview"><FileAudio className="h-10 w-10 text-red-400" /><audio src={url} controls /></div> : url ? <iframe className="public-preview-frame text-frame" src={url} title={file.name} /> : <div className="generic-preview">{fileIcon(file.mimeType)}<span>Preview unavailable.</span></div>; return <div className="modal-layer"><div className="modal-card preview-modal"><button className="modal-close" onClick={onClose}><X className="h-4 w-4" /></button><div className="modal-kicker"><ShieldCheck className="h-3.5 w-3.5" /> View-only preview</div><h2>{file.name}</h2><p>{formatBytes(file.sizeBytes)} · Uploaded {formatDate(file.createdAt)}</p><div className="modal-body"><div className="preview-stage in-modal">{loading ? <div className="loading-screen"><div className="loading-orbit" /><span>Generating secure preview...</span></div> : preview}</div><div className="preview-actions"><button className="ghost-btn" onClick={onClose}>Close</button>{url && <a className="red-btn" href={url} download={file.name}><Download className="h-4 w-4" /> Download copy</a>}</div></div></div></div>; }
function RoomsSection({ rooms, onCreate, onJoin, onCopy }: { rooms: RoomRow[]; onCreate: () => void; onJoin: () => void; onCopy: (code: string) => void }) { return <section className="section-grid"><div className="panel wide-panel"><div className="panel-header"><div><h2>Private rooms</h2><p>Every room uses a unique secret. Collaborators can upload, preview, download and organize files without making them public.</p></div><div className="heading-actions"><button className="ghost-btn" onClick={onJoin}><LockKeyhole className="h-4 w-4" /> Join room</button><button className="red-btn" onClick={onCreate}><Plus className="h-4 w-4" /> New room</button></div></div><div className="room-cards">{rooms.map((room) => <div className="room-card" key={room.id}><div className="room-card-top"><div className="room-avatar large"><LockKeyhole className="h-5 w-5" /></div><span className="secure-badge"><ShieldCheck className="h-3 w-3" /> Encrypted</span></div><h3>{room.name}</h3><p>Private collaboration room</p><div className="room-code"><span>{room.roomCode}</span><button className="icon-btn" onClick={() => onCopy(room.roomCode)}><Copy className="h-4 w-4" /></button></div><div className="room-card-footer"><span>Created {formatDate(room.createdAt)}</span><button className="text-btn">Open room <ArrowUpRight className="h-3.5 w-3.5" /></button></div></div>)}{!rooms.length && <EmptyState icon={<LockKeyhole />} title="No private rooms" copy="Create a room to share files with a trusted group." />}</div></div></section>; }
function FoldersSection({ folders, onCreate, onRename, onDelete }: { folders: FolderRow[]; onCreate: () => void; onRename: (id: number, name: string) => void; onDelete: (id: number) => void }) { return <section className="section-grid"><div className="panel wide-panel"><div className="panel-header"><div><h2>Folders</h2><p>Organize files with nested folders and room-specific workspaces.</p></div><button className="red-btn" onClick={onCreate}><FolderPlus className="h-4 w-4" /> New folder</button></div><div className="folder-large-grid">{folders.map((folder) => <div className="folder-large" key={folder.id}><div className="folder-symbol large"><Folder className="h-7 w-7" /></div><div><h3>{folder.name}</h3><p>Created {formatDate(folder.createdAt)}</p></div><button className="icon-btn" title="Rename folder" onClick={() => { const next = window.prompt("Rename folder", folder.name); if (next?.trim()) onRename(folder.id, next.trim()); }}><Settings2 className="h-4 w-4" /></button><button className="icon-btn danger" title="Delete folder" onClick={() => { if (window.confirm(`Delete ${folder.name}? Files inside will be moved to the root.`)) onDelete(folder.id); }}><Trash2 className="h-4 w-4" /></button></div>)}{!folders.length && <EmptyState icon={<Folder />} title="No folders yet" copy="Keep your vault clean with project folders." />}</div></div></section>; }
function AdminPanel() { const admin = trpc.admin.snapshot.useQuery(undefined, { refetchOnWindowFocus: false }); const remove = trpc.admin.deleteFile.useMutation({ onSuccess: () => { admin.refetch(); toast.success("File removed from moderation queue"); }, onError: (error) => toast.error(error.message) }); if (admin.isLoading) return <div className="panel loading-panel">Loading admin telemetry...</div>; const data = admin.data; if (!data) return <div className="panel loading-panel">Admin access required.</div>; return <section className="section-grid"><div className="admin-stat-row"><StatCard icon={<HardDrive />} label="Total storage" value={formatBytes(data.stats.bytes)} detail="Across all users" accent="red" /><StatCard icon={<Users />} label="Users" value={String(data.stats.users)} detail="Registered accounts" /><StatCard icon={<LockKeyhole />} label="Rooms" value={String(data.stats.rooms)} detail="Private spaces" /><StatCard icon={<ShieldCheck />} label="Files" value={String(data.stats.files)} detail="Moderation scope" accent="amber" /></div><div className="panel wide-panel"><div className="panel-header"><div><h2>Moderation queue</h2><p>Review and remove abusive content. Private metadata is never exposed to public search.</p></div><span className="secure-badge"><ShieldCheck className="h-3 w-3" /> Admin only</span></div><div className="file-list">{data.files.map((file) => <div className="file-item" key={file.id}><div className="file-type">{fileIcon(file.mimeType)}</div><div className="file-copy"><strong>{file.name}</strong><span>User {file.ownerId} · {formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}</span></div><div className={`visibility-badge ${file.visibility}`}><span />{file.visibility}</div><button className="icon-btn danger" title="Remove file" onClick={() => remove.mutate({ id: file.id })}><Trash2 className="h-4 w-4" /></button></div>)}</div></div></section>; }
