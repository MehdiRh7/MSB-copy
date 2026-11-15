import React, { useRef, useState } from 'react';
import { FileSpreadsheet, X, UploadCloud, AlertTriangle, Loader2, Trash2, FileText, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mockDepartments } from '../../mock/data';
import { proposalService } from '../../services/proposalService';
import {
  ProposalImportParseResult,
  ProposalImportRow,
  parseProposalExcelFile,
  importValidProposalRows,
} from '../../services/proposalExcelImportService';
import { toPersianDigits, formatFileSize } from '../../utils/formatters';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

type ModalStep = 'UPLOAD' | 'PREVIEW';
type FileStatus = 'PARSING' | 'READY' | 'ERROR';

interface SelectedFileEntry {
  clientId: string;
  file: File;
  status: FileStatus;
  result?: ProposalImportParseResult;
  error?: string;
}

let clientIdCounter = 0;
const nextClientId = () => `xlsx-file-${Date.now()}-${clientIdCounter++}`;

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose, onImported }) => {
  const { currentUser, availableUsers, showToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ModalStep>('UPLOAD');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileEntry[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setStep('UPLOAD');
    setSelectedFiles([]);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const parseOneFile = async (clientId: string, file: File) => {
    try {
      const existingProposalsRes = await proposalService.getProposals({ pageSize: 1000 });
      const result = await parseProposalExcelFile(file, {
        departments: mockDepartments,
        users: availableUsers,
        existingProposals: existingProposalsRes.isSuccess ? existingProposalsRes.data.items : [],
      });
      setSelectedFiles((prev) => prev.map((entry) => (entry.clientId === clientId ? { ...entry, status: 'READY', result } : entry)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فایل قابل پردازش نیست.';
      setSelectedFiles((prev) => prev.map((entry) => (entry.clientId === clientId ? { ...entry, status: 'ERROR', error: message } : entry)));
    }
  };

  const isDuplicateFile = (file: File) =>
    selectedFiles.some((entry) => entry.file.name === file.name && entry.file.size === file.size);

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const toAdd: SelectedFileEntry[] = [];
    incoming.forEach((file) => {
      if (!/\.xlsx$/i.test(file.name)) {
        showToast('خطا', `فایل «${file.name}» فرمت xlsx. ندارد و اضافه نشد.`, 'error');
        return;
      }
      if (isDuplicateFile(file) || toAdd.some((entry) => entry.file.name === file.name && entry.file.size === file.size)) {
        showToast('فایل تکراری', `فایل «${file.name}» قبلاً به لیست اضافه شده است.`, 'warning');
        return;
      }
      toAdd.push({ clientId: nextClientId(), file, status: 'PARSING' });
    });
    if (toAdd.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...toAdd]);
    toAdd.forEach((entry) => parseOneFile(entry.clientId, entry.file));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleRemoveFile = (clientId: string) => {
    setSelectedFiles((prev) => prev.filter((entry) => entry.clientId !== clientId));
  };

  const isAnyParsing = selectedFiles.some((entry) => entry.status === 'PARSING');
  const readyFiles = selectedFiles.filter((entry) => entry.status === 'READY' && entry.result);

  // Flattened view across every successfully-parsed file, each row tagged
  // with its source file name for the combined preview table.
  const combinedRows: { fileName: string; row: ProposalImportRow }[] = readyFiles.flatMap((entry) =>
    (entry.result?.rows || []).map((row) => ({ fileName: entry.file.name, row }))
  );
  const combinedValidCount = combinedRows.filter((r) => r.row.isValid).length;
  const combinedInvalidCount = combinedRows.length - combinedValidCount;

  const goToPreview = () => {
    if (selectedFiles.length === 0 || isAnyParsing) return;
    setStep('PREVIEW');
  };

  const handleConfirmImport = async () => {
    if (combinedValidCount === 0) return;
    const confirmed = window.confirm(
      `${toPersianDigits(combinedValidCount)} پیشنهاد معتبر از این فایل‌ها وارد سامانه و برای بررسی مدیرعامل ارسال خواهند شد. آیا ادامه می‌دهید؟`
    );
    if (!confirmed) return;

    setIsImporting(true);
    try {
      const allRows = combinedRows.map((r) => r.row);
      const summary = await importValidProposalRows(allRows, currentUser);
      onImported();
      showToast('ورود از Excel', `${toPersianDigits(summary.importedCount)} پیشنهاد با موفقیت ثبت و به کارتابل مدیرعامل ارسال شد.`, 'success');
      handleClose();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ثبت پیشنهادها انجام نشد.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-800 text-teal-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">ورود پیشنهاد مصوبات از Excel</h3>
              <p className="text-[12px] text-teal-200">آپلود، بررسی و پیش‌نمایش پیش از ثبت نهایی</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {step === 'UPLOAD' && (
            <div className="space-y-3">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-200 hover:border-teal-400 rounded-2xl p-8 text-center bg-slate-50/50 transition-colors"
              >
                <UploadCloud className="w-9 h-9 text-teal-700 mx-auto mb-3" />
                <p className="text-xs font-bold text-slate-700 mb-1">یک یا چند فایل Excel تکمیل‌شده را انتخاب یا رها کنید</p>
                <p className="text-[11px] text-slate-400 mb-4">فقط فرمت xlsx. پذیرفته می‌شود</p>
                <label className="bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer inline-flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{selectedFiles.length > 0 ? 'افزودن فایل دیگر' : 'انتخاب فایل'}</span>
                  <input ref={fileInputRef} type="file" accept=".xlsx" multiple className="hidden" onChange={handleFileInputChange} />
                </label>
              </div>

              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  {selectedFiles.map((entry) => (
                    <div key={entry.clientId} className="flex items-center justify-between gap-2.5 p-2.5 bg-white border border-slate-200/90 rounded-xl shadow-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-teal-50 text-teal-700 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate" title={entry.file.name}>{entry.file.name}</p>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{formatFileSize(entry.file.size)}</span>
                            <span>•</span>
                            {entry.status === 'PARSING' && (
                              <span className="flex items-center gap-1 text-slate-500"><Loader2 className="w-3 h-3 animate-spin" />در حال بررسی...</span>
                            )}
                            {entry.status === 'READY' && entry.result && (
                              <span className={entry.result.invalidCount > 0 ? 'text-amber-600 font-bold' : 'text-emerald-700 font-bold'}>
                                معتبر: {toPersianDigits(entry.result.validCount)} — دارای خطا: {toPersianDigits(entry.result.invalidCount)}
                              </span>
                            )}
                            {entry.status === 'ERROR' && (
                              <span className="text-rose-600 font-bold">{entry.error}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(entry.clientId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors shrink-0 cursor-pointer"
                        title="حذف فایل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'PREVIEW' && (
            <div className="space-y-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                <span className="font-bold text-slate-700">تعداد فایل: {toPersianDigits(readyFiles.length)}</span>
                <span className="text-slate-500">تعداد ردیف‌ها: {toPersianDigits(combinedRows.length)}</span>
                <span className="text-emerald-700 font-bold">معتبر: {toPersianDigits(combinedValidCount)}</span>
                <span className="text-rose-700 font-bold">دارای خطا: {toPersianDigits(combinedInvalidCount)}</span>
              </div>

              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full min-w-[820px] text-right text-[12px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                      <th className="py-2 px-2.5 font-semibold">ردیف</th>
                      <th className="py-2 px-2.5 font-semibold">فایل</th>
                      <th className="py-2 px-2.5 font-semibold">عنوان</th>
                      <th className="py-2 px-2.5 font-semibold">سازمان</th>
                      <th className="py-2 px-2.5 font-semibold">ارائه‌دهنده</th>
                      <th className="py-2 px-2.5 font-semibold">شماره نامه</th>
                      <th className="py-2 px-2.5 font-semibold">تاریخ نامه</th>
                      <th className="py-2 px-2.5 font-semibold">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {combinedRows.map(({ fileName, row }, i) => (
                      <tr key={`${fileName}-${row.rowNumber}-${i}`} className={row.isValid ? '' : 'bg-rose-50/40'}>
                        <td className="py-2 px-2.5 text-slate-500">{toPersianDigits(row.rowNumber)}</td>
                        <td className="py-2 px-2.5 text-slate-500 max-w-[120px] truncate" title={fileName}>{fileName}</td>
                        <td className="py-2 px-2.5 text-slate-700 font-bold max-w-[140px] truncate" title={row.title}>{row.title || '—'}</td>
                        <td className="py-2 px-2.5 text-slate-600">{row.matchedDepartment?.name || row.proposerDepartmentNameRaw || '—'}</td>
                        <td className="py-2 px-2.5 text-slate-600">{row.matchedPresenter?.fullName || row.presenterNameRaw || '—'}</td>
                        <td className="py-2 px-2.5 text-slate-600">{toPersianDigits(row.letterNumber) || '—'}</td>
                        <td className="py-2 px-2.5 text-slate-600">{toPersianDigits(row.letterDateJalali) || '—'}</td>
                        <td className="py-2 px-2.5">
                          {row.isValid ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">معتبر</span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">خطا</span>
                              <ul className="text-[11px] text-rose-600 list-disc pr-3">
                                {row.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                              </ul>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          {step === 'UPLOAD' && (
            <>
              <button onClick={handleClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer">
                انصراف
              </button>
              <button
                onClick={goToPreview}
                disabled={selectedFiles.length === 0 || isAnyParsing}
                className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnyParsing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>بررسی و پیش‌نمایش</span>
              </button>
            </>
          )}
          {step === 'PREVIEW' && (
            <>
              <button onClick={() => setStep('UPLOAD')} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer">
                بازگشت به مدیریت فایل‌ها
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isImporting || combinedValidCount === 0}
                className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isImporting ? 'در حال ثبت...' : 'ثبت و ارسال پیشنهادهای معتبر'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
