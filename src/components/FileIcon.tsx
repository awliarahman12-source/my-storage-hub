import type { DashboardFile, ExplorerFile, DriveFileItem } from '@/types';
import {
  Folder,
  FileText,
  FileArchive,
  Image,
  Film,
  Music,
  File,
  Play,
} from 'lucide-react';

type IconFile = DashboardFile | ExplorerFile | DriveFileItem;

export function DashboardFileIcon({ file }: { file: IconFile }) {
  if (file.type === 'folder') return <div className="file-icon"><Folder size={18} /></div>;
  if (file.type === 'pdf') return <div className="file-icon pdf"><FileText size={18} /></div>;
  if (file.type === 'zip') return <div className="file-icon zip"><FileArchive size={18} /></div>;
  if (file.type === 'img') return <div className="file-icon img"><Image size={18} /></div>;
  if (file.type === 'video') return <div className="file-icon"><Film size={18} /></div>;
  if (file.type === 'audio') return <div className="file-icon"><Music size={18} /></div>;
  return <div className="file-icon"><File size={18} /></div>;
}

function isExplorerFile(f: IconFile): f is ExplorerFile {
  return 'parent' in f;
}

function isDriveFileItem(f: IconFile): f is DriveFileItem {
  return 'nodeId' in f && 'thumbnail' in f;
}

export function V3Icon({ file }: { file: IconFile }) {
  if (file.type === 'folder') {
    return <span className="v3-icon v3-folder"><Folder size={22} /></span>;
  }

  if (isDriveFileItem(file) && file.type === 'img' && file.thumbnail) {
    return <img className="v3-media-icon" src={file.thumbnail} alt="" />;
  }
  if (isExplorerFile(file) && file.type === 'img' && file.preview) {
    return <img className="v3-media-icon" src={file.preview} alt="" />;
  }
  if (file.type === 'img') {
    return <span className="v3-icon v3-image"><Image size={22} /></span>;
  }

  if (isExplorerFile(file) && file.type === 'video' && file.preview) {
    return (
      <span className="v3-video-thumb">
        <img src={file.preview} alt="" />
        <span className="v3-play">
          <Play size={12} fill="currentColor" stroke="none" />
        </span>
      </span>
    );
  }
  if (file.type === 'video') {
    return <span className="v3-icon v3-video"><Film size={22} /></span>;
  }
  if (file.type === 'pdf') {
    return <span className="v3-icon v3-pdf"><FileText size={22} /></span>;
  }
  if (file.type === 'audio') {
    return <span className="v3-icon v3-audio"><Music size={22} /></span>;
  }
  if (file.type === 'zip') {
    return <span className="v3-icon v3-archive"><FileArchive size={22} /></span>;
  }
  return <span className="v3-icon v3-file"><File size={22} /></span>;
}