import React, { useState, useEffect, useRef } from "react";
import { useGithubStore } from "../../githubStore";
import { ConnectModal } from "./ConnectModal";
import { LogOut, User, Users, ChevronDown, UserPlus } from "lucide-react";

export const GithubMenu: React.FC = () => {
  const { user, accounts, activeAccount, init, switchAccount, logout } = useGithubStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, []);

  const handleSwitch = async (login: string) => {
    setDropdownOpen(false);
    await switchAccount(login);
  };

  const handleLogout = async (login?: string) => {
    setDropdownOpen(false);
    await logout(login);
  };

  return (
    <div className="relative" ref={containerRef}>
      {user ? (
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded px-2.5 py-1 text-xs font-mono transition-colors"
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.login} className="w-4 h-4 rounded-full" />
          ) : (
            <User size={13} />
          )}
          <span>{user.login}</span>
          <ChevronDown size={10} className="text-zinc-500" />
        </button>
      ) : (
        <button
          onClick={() => setConnectOpen(true)}
          className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded px-2.5 py-1 text-xs font-mono transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </svg>
          <span>Connect GitHub</span>
        </button>
      )}

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-1 w-52 bg-zinc-900 border border-zinc-800 rounded shadow-xl z-50 overflow-hidden font-mono text-xs">
          {/* Active User Account Details */}
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950/40">
            <span className="text-[10px] text-zinc-500 block leading-tight">Connected as</span>
            <span className="text-zinc-200 font-medium block truncate mt-0.5">{user?.name || user?.login}</span>
          </div>

          {/* Accounts list (switchers) */}
          {accounts.length > 1 && (
            <div className="border-b border-zinc-800 py-1">
              <span className="px-3 py-1 text-[9px] text-zinc-500 flex items-center gap-1 leading-none">
                <Users size={9} /> Switch Account
              </span>
              {accounts.map((acc) => {
                if (acc === activeAccount) return null;
                return (
                  <button
                    key={acc}
                    onClick={() => handleSwitch(acc)}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 truncate"
                  >
                    {acc}
                  </button>
                );
              })}
            </div>
          )}

          {/* Action Links */}
          <div className="py-1">
            <button
              onClick={() => {
                setDropdownOpen(false);
                setConnectOpen(true);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center gap-2"
            >
              <UserPlus size={12} className="text-zinc-500" />
              Add another account
            </button>
            <button
              onClick={() => handleLogout()}
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-rose-400 hover:text-rose-300 flex items-center gap-2"
            >
              <LogOut size={12} className="text-zinc-500" />
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Connect Modal */}
      <ConnectModal isOpen={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  );
};
