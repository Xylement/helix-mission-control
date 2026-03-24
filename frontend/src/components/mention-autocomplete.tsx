"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api, type MentionResult } from "@/lib/api";
import { Bot, User } from "lucide-react";

interface MentionAutocompleteProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}

export function MentionAutocomplete({ textareaRef, value, onChange }: MentionAutocompleteProps) {
  const [results, setResults] = useState<MentionResult[]>([]);
  const [visible, setVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const searchMentions = useCallback(async (q: string) => {
    try {
      const res = await api.searchMentions(q);
      setResults(res);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    }
  }, []);

  // Detect @ trigger from cursor position
  const checkForMention = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBefore = value.substring(0, cursorPos);

    // Find the last @ before cursor that isn't preceded by a word char
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      const atPos = textBefore.lastIndexOf("@" + match[1]);
      // Make sure the @ is at the start or preceded by a space/newline
      if (atPos === 0 || /[\s\n]/.test(textBefore[atPos - 1])) {
        setMentionStart(atPos);
        setVisible(true);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchMentions(match[1]), 150);
        return;
      }
    }

    setVisible(false);
    setMentionStart(-1);
  }, [value, textareaRef, searchMentions]);

  useEffect(() => {
    checkForMention();
  }, [value, checkForMention]);

  const insertMention = useCallback((item: MentionResult) => {
    if (mentionStart < 0) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea?.selectionStart || value.length;
    const before = value.substring(0, mentionStart);
    const after = value.substring(cursorPos);
    const newValue = `${before}@${item.name} ${after}`;

    onChange(newValue);
    setVisible(false);
    setMentionStart(-1);

    // Restore focus and cursor position
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        const newPos = mentionStart + item.name.length + 2; // @Name + space
        textarea.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [mentionStart, value, onChange, textareaRef]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
        if (results.length > 0) {
          e.preventDefault();
          insertMention(results[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        setVisible(false);
      }
    };

    const textarea = textareaRef.current;
    textarea?.addEventListener("keydown", handler);
    return () => textarea?.removeEventListener("keydown", handler);
  }, [visible, results, selectedIndex, insertMention, textareaRef]);

  if (!visible || results.length === 0) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full mb-1 left-0 w-full max-w-sm bg-white dark:bg-gray-900 border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
    >
      {results.map((item, i) => (
        <button
          key={`${item.type}-${item.id}`}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent"
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // Don't blur the textarea
            insertMention(item);
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          {item.type === "agent" ? (
            <Bot className="h-4 w-4 text-blue-500 shrink-0" />
          ) : (
            <User className="h-4 w-4 text-gray-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <span className="font-medium">{item.name}</span>
            <span className="text-xs text-muted-foreground ml-2">
              {item.role}
              {item.department && ` · ${item.department}`}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground uppercase">
            {item.type}
          </span>
        </button>
      ))}
    </div>
  );
}
