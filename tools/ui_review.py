#!/usr/bin/env python3
"""布谷项目 UI 评审工具 —— 基于火山方舟豆包视觉模型。

用法:
    python tools/ui_review.py <截图路径> [页面描述] [-o 输出报告路径]
    python tools/ui_review.py --dir <截图目录>          # 批量评审目录下所有图片
    python tools/ui_review.py --list-models              # 列出账号可用模型

环境变量:
    ARK_API_KEY   方舟 API Key（必填）
    ARK_MODEL     视觉模型 ID（默认 doubao-seed-2-0-pro-260215，可换 lite 提速）

依赖: 仅 Python 标准库（urllib + base64 + os），无需第三方包。
"""
import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_MODEL = "doubao-seed-2-0-pro-260215"
API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"

REVIEW_PROMPT = """你是一名资深 UI/UX 评审专家。请从以下维度评审这张 APP 界面截图，输出结构化评审报告：
1. 视觉设计：配色和谐度、对比度、字体层级、留白是否合理
2. 布局与对齐：元素对齐、间距一致性、信息密度是否合适
3. 可用性：主要操作是否清晰可达、反馈是否明确、是否符合移动端习惯
4. 一致性：与健康管理类产品调性（温和、可信、清爽）是否一致
5. 无障碍：文字可读性、触摸目标大小、色彩对比度
6. 问题清单：按【严重/一般/建议】分级列出具体问题（引用截图中的实际元素）
7. 改进建议：给出可执行的修改建议（具体到颜色值、字号、间距等）
最后给出 1-10 的总体评分。请用中文回答。"""


def encode_image(path: str) -> str:
    """读取图片并编码为 base64 data URI。"""
    mime = mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


def call_vision(image_data_uri: str, page_desc: str, model: str, api_key: str) -> str:
    """调用方舟视觉模型评审图片，返回模型回复文本。"""
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": REVIEW_PROMPT + (f"\n\n截图对应的页面：{page_desc}" if page_desc else "")},
                    {"type": "image_url", "image_url": {"url": image_data_uri}},
                ],
            }
        ],
        "max_tokens": 2000,
        "temperature": 0.3,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"方舟 API 调用失败 (HTTP {e.code}): {body[:300]}")


def list_models(api_key: str) -> list:
    """列出账号可用的模型（用于排查模型未开通等问题）。"""
    req = urllib.request.Request(
        "https://ark.cn-beijing.volces.com/api/v3/models",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode()).get("data", [])


def main() -> int:
    parser = argparse.ArgumentParser(description="布谷项目 UI 视觉评审工具（火山方舟豆包）")
    parser.add_argument("image", nargs="?", help="截图路径（PNG/JPG）")
    parser.add_argument("desc", nargs="?", default="", help="页面描述，帮助模型理解页面上下文")
    parser.add_argument("--dir", help="批量评审目录下所有图片")
    parser.add_argument("-o", "--output", help="评审报告输出路径（默认打印到终端）")
    parser.add_argument("--model", default=os.environ.get("ARK_MODEL", DEFAULT_MODEL), help="视觉模型 ID")
    parser.add_argument("--list-models", action="store_true", help="列出账号可用模型后退出")
    args = parser.parse_args()

    api_key = os.environ.get("ARK_API_KEY")
    if not api_key:
        print("错误: 缺少环境变量 ARK_API_KEY（请在 .env 或系统环境变量中配置）", file=sys.stderr)
        return 1

    if args.list_models:
        for m in list_models(api_key):
            print(m["id"])
        return 0

    if args.dir:
        images = sorted(p for p in Path(args.dir).glob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
        if not images:
            print(f"目录中没有图片: {args.dir}", file=sys.stderr)
            return 1
        results = []
        for img in images:
            print(f"▶ 评审 {img.name} ...")
            report = call_vision(encode_image(str(img)), args.desc, args.model, api_key)
            results.append(f"\n{'=' * 60}\n## {img.name}\n{'=' * 60}\n{report}")
        out = "\n".join(results)
    elif args.image:
        out = call_vision(encode_image(args.image), args.desc, args.model, api_key)
        out = f"## {args.image}\n\n{out}"
    else:
        parser.print_help()
        return 1

    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
        print(f"评审报告已写入: {args.output}")
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
