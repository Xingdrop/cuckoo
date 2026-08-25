import { Fragment } from 'react';

const URL_RE = /(https?:\/\/[^\s，。【】（）()""'']+)/g;

/** 富文本链接（#2）：文本中的 URL 渲染为可点击外链（跳转视频 App 等平台） */
export function LinkedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        URL_RE.test(p) && p.startsWith('http') ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all text-primary-600 underline underline-offset-2"
          >
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}
