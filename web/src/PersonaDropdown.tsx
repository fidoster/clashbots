import { useState, useRef, useEffect } from "react";
import { PERSONAS, type PersonaOption } from "./personas.js";

const CATEGORIES = [
  { id: "default", label: "Styles" },
  { id: "historical", label: "History" },
  { id: "fictional", label: "Fictional" },
  { id: "tech", label: "Tech/Pop" },
  { id: "archetypes", label: "Archetypes" },
  { id: "scifi", label: "Sci-Fi" },
];

export function PersonaDropdown(props: {
  value: string;
  sideColor: "blue" | "green";
  onChange: (personaText: string | undefined) => void;
  persona: PersonaOption;
}) {
  const { value, sideColor, onChange, persona } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>("default");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  const toggleCategory = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCat(expandedCat === catId ? null : catId);
  };

  const handleSelect = (p: PersonaOption, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(p.persona);
    setIsOpen(false);
  };

  return (
    <div className="persona-dropdown-container" ref={containerRef}>
      <button
        type="button"
        className={`persona-select-trigger ${sideColor}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Select debating persona"
      >
        <span className="stat-ico">{persona.emoji}</span>
        <span className="persona-trigger-label">{persona.label}</span>
        <span className="persona-trigger-caret">▼</span>
      </button>

      {isOpen && (
        <div className={`persona-dropdown-menu ${sideColor}`}>
          <div className="persona-dropdown-scroll">
            {CATEGORIES.map((cat) => {
              const isExpanded = expandedCat === cat.id;
              const catPersonas = PERSONAS.filter((p) => p.category === cat.id);
              return (
                <div key={cat.id} className="persona-dropdown-group">
                  <button
                    type="button"
                    className={`persona-dropdown-cat-header ${isExpanded ? "expanded" : ""}`}
                    onClick={(e) => toggleCategory(cat.id, e)}
                  >
                    <span>{cat.label}</span>
                    <span className="cat-caret">{isExpanded ? "▲" : "▼"}</span>
                  </button>
                  {isExpanded && (
                    <div className="persona-dropdown-list">
                      {catPersonas.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`persona-dropdown-item ${p.id === value ? "active" : ""}`}
                          onClick={(e) => handleSelect(p, e)}
                        >
                          <span className="item-emoji">{p.emoji}</span>
                          <span className="item-label">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
