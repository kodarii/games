import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Link } from 'react-router-dom';

export function DictionariesPage() {
  return (
    <>
      <PageHeader icon={<Icon.rows size={20} />} title="Dictionaries" />
      <div className="flex-1 overflow-y-auto bg-[#fafafa] px-5 pb-4 pt-4">
        <div className="max-w-2xl">
          <Link
            to="/dictionaries/platforms"
            className="flex items-center gap-4 rounded-[12px] border border-apex-line-3 bg-white px-5 py-4 transition-colors hover:bg-apex-surface-hover"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-apex-surface-head text-apex-ink-4">
              <Icon.zap size={18} />
            </span>
            <div>
              <div className="text-[14px] font-semibold text-apex-ink">Platforms</div>
              <div className="text-[12px] text-apex-muted">Manage platforms for your collection</div>
            </div>
            <span className="ml-auto text-apex-idle">
              <Icon.chevright size={14} />
            </span>
          </Link>
        </div>
      </div>
    </>
  );
}
