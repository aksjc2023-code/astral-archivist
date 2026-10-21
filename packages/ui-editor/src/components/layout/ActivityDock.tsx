import React from 'react';
import { ActivityDockTab } from '@astral/core';
import {
  IconPlusFolder,
  IconWand,
  IconTransitions,
  IconTitles,
  IconStickers,
  IconTools,
} from '../common/ScarletIcons';

export interface ActivityDockProps {
  activeTab: ActivityDockTab;
  onTabChange: (tab: ActivityDockTab) => void;
}

export const ActivityDock: React.FC<ActivityDockProps> = ({ activeTab, onTabChange }) => {
  const dockItems: Array<{
    id: ActivityDockTab;
    label: string;
    icon: React.ReactNode;
    hasNotificationDot?: boolean;
  }> = [
    { id: 'media', label: 'Import & Media Bin', icon: <IconPlusFolder size={22} /> },
    { id: 'filters', label: 'Filters & LUTs', icon: <IconWand size={22} />, hasNotificationDot: true },
    { id: 'transitions', label: 'Transitions', icon: <IconTransitions size={22} /> },
    { id: 'titles', label: 'Titles & Captions', icon: <IconTitles size={22} />, hasNotificationDot: true },
    { id: 'stickers', label: 'Stickers & Overlays', icon: <IconStickers size={22} /> },
    { id: 'tools', label: 'Tools & Audio Purifier', icon: <IconTools size={22} /> },
  ];

  return (
    <aside
      style={{
        width: '56px',
        backgroundColor: '#14171C',
        borderRight: '1px solid #22262E',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '12px',
        gap: '10px',
        zIndex: 20,
        userSelect: 'none',
      }}
    >
      {dockItems.map(item => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={() => onTabChange(item.id)}
            style={{
              position: 'relative',
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isActive ? '#168BFF' : 'transparent',
              color: isActive ? '#FFFFFF' : '#8A95A5',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: isActive ? '0 2px 10px rgba(22, 139, 255, 0.35)' : 'none',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#1E232B';
                (e.currentTarget as HTMLElement).style.color = '#FFFFFF';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLElement).style.color = '#8A95A5';
              }
            }}
          >
            {item.icon}
            {item.hasNotificationDot && !isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#168BFF',
                }}
              />
            )}
          </button>
        );
      })}
    </aside>
  );
};
