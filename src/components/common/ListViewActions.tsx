import React from 'react';
import { FileDown, LayoutGrid, Search, Table2 } from 'lucide-react';

export type ListViewMode = 'cards' | 'grid';

interface ListViewActionsProps {
  filtersOpen: boolean;
  onToggleFilters: () => void;
  viewMode: ListViewMode;
  onViewModeChange: (mode: ListViewMode) => void;
  onExportPdf: () => void;
}

export const ListViewActions: React.FC<ListViewActionsProps> = ({
  filtersOpen,
  onToggleFilters,
  viewMode,
  onViewModeChange,
  onExportPdf,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <button
      type="button"
      onClick={onExportPdf}
      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-full border border-slate-200 transition-colors cursor-pointer"
    >
      <FileDown className="w-3.5 h-3.5" />
      <span>خروجی PDF</span>
    </button>

    <button
      type="button"
      onClick={onToggleFilters}
      className={`flex items-center gap-1.5 font-bold text-xs py-2 px-3 rounded-full border transition-colors cursor-pointer ${filtersOpen ? 'app-primary-button text-white border-transparent' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
    >
      <Search className="w-3.5 h-3.5" />
      <span>{filtersOpen ? 'بستن جستجو' : 'جستجو و فیلتر'}</span>
    </button>

    <div className="flex items-center rounded-full border border-slate-200 bg-slate-100 p-1" aria-label="انتخاب نوع نمایش">
      <button
        type="button"
        onClick={() => onViewModeChange('cards')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors ${viewMode === 'cards' ? 'app-primary-button text-white' : 'text-slate-600 hover:bg-white'}`}
        title="نمایش کارتی"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">کارتی</span>
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange('grid')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors ${viewMode === 'grid' ? 'app-primary-button text-white' : 'text-slate-600 hover:bg-white'}`}
        title="نمایش جدولی"
      >
        <Table2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">جدولی</span>
      </button>
    </div>
  </div>
);
