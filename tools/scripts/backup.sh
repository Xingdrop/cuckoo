#!/usr/bin/env bash
# 布谷（Cuckoo）SQLite 数据库备份脚本（WAL 安全）
# 用法：./backup.sh [备份目录] [保留份数]
# 建议 cron：0 2 * * * /opt/cuckoo/tools/scripts/backup.sh >> /var/log/cuckoo-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${1:-$(dirname "$0")/../../backend/backups}"
KEEP="${2:-14}"
DB_PATH="${DB_PATH:-data/cuckoo.sqlite}"
# 相对于 backend 目录（脚本默认在 tools/scripts/ 下运行时可调整）
if [ ! -f "$DB_PATH" ]; then
  # 尝试相对 backend 目录解析
  DB_PATH="backend/$DB_PATH"
fi

if [ ! -f "$DB_PATH" ]; then
  echo "[$(date '+%F %T')] 错误：找不到数据库文件 $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/cuckoo-$STAMP.sqlite"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$OUT'"
else
  echo "警告：未安装 sqlite3 CLI，改用直接复制（WAL 未合并，请保持后端停止时使用）"
  cp "$DB_PATH" "$OUT"
  [ -f "$DB_PATH-wal" ] && cp "$DB_PATH-wal" "$OUT-wal"
fi

# 清理过期备份
ls -1t "$BACKUP_DIR"/cuckoo-*.sqlite 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "[$(date '+%F %T')] 备份完成：$OUT（保留最近 $KEEP 份）"
