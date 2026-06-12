#!/bin/bash
# ============================================================
# Babyplace AI 全链路功能 - 自动构建脚本（harness 并行版）
# 使用 git worktree 隔离 + 多进程并行执行 Phase
# ============================================================

set -euo pipefail

# ─── 配置 ──────────────────────────────────────────────────
PROJECT_DIR="/opt/babyplace"
PLAN_FILE="/root/.claude/plans/sunny-coalescing-mist.md"
LOG_DIR="/var/log/babyplace"
LOG_FILE="${LOG_DIR}/auto-build-$(date +%Y%m%d_%H%M%S).log"
LOCK_FILE="/tmp/babyplace-auto-build.lock"
MAX_RUNTIME=7200  # 单 Phase 最大运行时间 2 小时

# worktree 目录（与项目目录同级，避免跨文件系统）
WORKTREE_BASE="/opt/babyplace-worktrees"
BRANCH_PREFIX="auto-build"

# AI 服务配置（从环境变量读取）
export OPENAI_API_KEY="${OPENAI_API_KEY:-t7npV6raGbd2f4HOMR4RRi0gsK2MbvPWk5TMs4i8Q9eJ80cG}"
export OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://aikey.aixifs.com/v1}"

# Remotion 服务配置
export REMOTION_SERVER_URL="http://lanes.ymxt.top:3010"
export REMOTION_TEMPLATE_ID="BabyplacePoi"

# ─── 颜色 & 日志 ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}
log_info()  { log "${GREEN}[INFO]${NC} $1"; }
log_warn()  { log "${YELLOW}[WARN]${NC} $1"; }
log_error() { log "${RED}[ERROR]${NC} $1"; }
log_wave()  { log "${CYAN}[WAVE]${NC} $1"; }

# ─── Phase 定义 ────────────────────────────────────────────
# 格式: id|name|description|tasks
# tasks 用 HEREDOC 在下面按 id 定义

get_phase_tasks() {
    local id=$1
    case $id in
    0) cat <<'TASKS'
1. 修改 src/manifest.json，在 mp-weixin.plugins 下添加 WechatSI 插件声明（provider: wx069ba97219f66d99, version: 0.3.7）
2. 创建 src/utils/voice.js，实现 ASR 和 TTS 功能
3. 创建 skills/dify-skill/components/voice-button/ 目录下的语音按钮组件（4个文件）
4. 验证代码语法正确性
TASKS
    ;;
    1) cat <<'TASKS'
1. 创建 scripts/config.json 配置文件（公众号、Dify、LLM 配置）
2. 编写 scripts/sync_pipeline.py 数据管线脚本，包含：
   - fetch_articles(): 采集公众号文章
   - enrich_with_llm(): LLM 生成摘要
   - sync_to_dify(): 同步到 Dify 知识库
3. 更新 uniCloud-aliyun/database/babyplace-poi.schema.json，新增 dify_document_id 和 dify_synced_at 字段
4. 更新 uniCloud-aliyun/database/babyplace-article.schema.json，新增 dify_synced_at 字段
5. 创建日志目录 /var/log/babyplace/
6. 验证 Python 脚本语法
TASKS
    ;;
    2) cat <<'TASKS'
1. 修改 uniCloud-aliyun/cloudfunctions/babyplace-admin/index.js，新增以下 action：
   - ai.searchPlaces: AI 语义搜索地点
   - map.searchNearby: 附近地点搜索
   - map.searchAmap: 高德地图搜索
   - meituan.search: 美团美食搜索
   - map.tencentSearch: 腾讯地图搜索
2. 创建 skills/dify-skill/apis/ 目录下的 API 文件：
   - searchPlaces.js
   - searchNearby.js
   - searchAmap.js
   - searchMeituan.js
3. 创建 skills/dify-skill/components/places-card/ 目录下的地点推荐卡片组件（4个文件）
4. 修改 skills/dify-skill/index.js，注册新 API
5. 修改 skills/dify-skill/mcp.json，补充新 API 的 schema
6. 修改 skills/dify-skill/SKILL.md，更新意图分流规则
7. 创建 uni-config-center 配置目录和文件
TASKS
    ;;
    3) cat <<'TASKS'
1. 修改 src/pages/webview/webview/webview.vue，实现真正的 web-view 容器
2. 修改 uniCloud-aliyun/database/babyplace-poi.schema.json，新增 booking_url、booking_type、booking_hint 字段
3. 创建 skills/dify-skill/components/meituan-card/ 目录下的美团美食卡片组件（4个文件）
4. 更新 places-card 组件，添加预约按钮和美团美食模块
5. 验证所有代码语法正确性
TASKS
    ;;
    4) cat <<'TASKS'
1. 创建 src/components/photo-capture/index.vue 拍照组件，支持：
   - 调用小程序相机拍照（3-5张）
   - 照片预览和删除
   - 触发生成事件
2. 修改 uniCloud-aliyun/cloudfunctions/babyplace-admin/index.js，新增以下 action：
   - video.uploadAndEnhance: 上传图片并调用 aikey.aixifs.com 魔搭 API 进行 AI 增强
   - video.render: 提交渲染任务到 http://lanes.ymxt.top:3010/api/renders，使用 BabyplacePoi 模板
   - video.renderStatus: 查询渲染状态
   - video.uploadToXHS: 上传视频到小红书（预留接口，参数文件待补充）
3. 创建 src/api/video.js，封装视频相关 API：
   - uploadAndEnhance(): 图片 AI 增强
   - renderVideo(): 提交渲染
   - getRenderStatus(): 查询状态
   - waitForRender(): 轮询等待完成
4. 创建 src/pages/video/capture.vue 拍照渲染页面：
   - 集成 photo-capture 组件
   - AI 风格选择（高清增强/卡通/水彩/素描）
   - 上传照片 → AI 增强 → 提交渲染流程
5. 创建 src/pages/video/preview.vue 视频预览页面，包含两个出口：
   - 出口1：保存到本地相册 → 提示用户手工上传视频号
   - 出口2：发布到小红书（预留按钮，需 API 资质）
   - 渲染进度展示
   - 视频播放器
6. 创建 uniCloud-aliyun/cloudfunctions/common/uni-config-center/xiaohongshu/config.json 配置文件（参数待补充）
7. 修改 src/pages.json，注册新页面路由：
   - pages/video/capture
   - pages/video/preview
8. 修改 src/pages/life/shop/shop.vue，在 POI 详情页添加生成视频入口
9. 验证所有代码语法正确性
TASKS
    ;;
    esac
}

# ─── Worktree 管理 ─────────────────────────────────────────

create_worktree() {
    local phase_id=$1
    local branch="${BRANCH_PREFIX}/phase-${phase_id}"
    local wt_path="${WORKTREE_BASE}/phase-${phase_id}"

    cd "$PROJECT_DIR"

    # 如果分支已存在先删除（残留清理）
    git branch -D "$branch" 2>/dev/null || true

    # 创建 worktree + 新分支
    git worktree add -b "$branch" "$wt_path" HEAD 2>/dev/null || {
        # worktree 目录残留，强制清理后重试
        rm -rf "$wt_path"
        git worktree prune
        git worktree add -b "$branch" "$wt_path" HEAD
    }

    echo "$wt_path"
}

merge_phase_branch() {
    local phase_id=$1
    local branch="${BRANCH_PREFIX}/phase-${phase_id}"

    cd "$PROJECT_DIR"

    # 检查分支是否有新提交
    local ahead=$(git rev-list --count HEAD.."$branch" 2>/dev/null || echo "0")
    if [ "$ahead" = "0" ]; then
        log_warn "Phase ${phase_id} 分支无新提交，跳过 merge"
        git branch -D "$branch" 2>/dev/null || true
        return 0
    fi

    log_info "合并 Phase ${phase_id} 分支 (${ahead} commits)..."
    if git merge "$branch" --no-edit -m "merge: Phase ${phase_id} auto-build"; then
        log_info "Phase ${phase_id} 合并成功"
    else
        log_error "Phase ${phase_id} 合并冲突，请手动解决"
        git merge --abort 2>/dev/null || true
        return 1
    fi

    git branch -D "$branch" 2>/dev/null || true
}

cleanup_worktree() {
    local phase_id=$1
    local wt_path="${WORKTREE_BASE}/phase-${phase_id}"

    cd "$PROJECT_DIR"
    git worktree remove "$wt_path" --force 2>/dev/null || true
    git worktree prune 2>/dev/null || true
}

# ─── Phase 执行 ────────────────────────────────────────────

# 全局关联数组收集结果（bash 4+）
declare -A PHASE_STATUS
declare -A PHASE_DURATION

execute_phase() {
    local phase_id=$1
    local phase_name=$2
    local phase_desc=$3
    local work_dir=$4

    local phase_log="${LOG_DIR}/phase-${phase_id}.log"
    local start_ts=$(date +%s)

    log_info "[Phase ${phase_id}] ${phase_name} - ${phase_desc}"
    log_info "[Phase ${phase_id}] worktree: ${work_dir}"
    log_info "[Phase ${phase_id}] 日志: ${phase_log}"

    local tasks=$(get_phase_tasks "$phase_id")

    local prompt="你是一个专业的软件开发工程师。请根据计划文件 ${PLAN_FILE} 中的 ${phase_name} 部分，自动完成以下任务：

${tasks}

要求：
1. 严格按照计划文件中的代码示例和文件路径执行
2. 创建新文件时确保目录结构正确
3. 修改现有文件时保留原有功能
4. 每个任务完成后进行简单的语法检查
5. 如果遇到问题，记录错误并继续执行下一个任务
6. 完成后输出执行摘要

配置信息：
- AI 服务 (aikey.aixifs.com): OPENAI_API_KEY=${OPENAI_API_KEY}, OPENAI_BASE_URL=${OPENAI_BASE_URL}
- Remotion 服务: ${REMOTION_SERVER_URL}
- Remotion 模板: ${REMOTION_TEMPLATE_ID}
- 云函数配置目录: uniCloud-aliyun/cloudfunctions/common/uni-config-center/

项目目录: ${work_dir}
当前时间: $(date '+%Y-%m-%d %H:%M:%S')"

    # 写日志头
    {
        echo "=========================================="
        echo "Phase ${phase_id}: ${phase_name}"
        echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "工作目录: ${work_dir}"
        echo "=========================================="
    } >> "$phase_log"

    # 在 worktree 目录下执行 claude
    local exit_code=0
    if timeout "$MAX_RUNTIME" bash -c "cd '${work_dir}' && claude --print --dangerously-skip-permissions --model sonnet '$(echo "$prompt" | sed "s/'/'\\\\''/g")'" >> "$phase_log" 2>&1; then
        PHASE_STATUS[$phase_id]="success"
        log_info "[Phase ${phase_id}] ✅ 执行成功"
    else
        exit_code=$?
        if [ $exit_code -eq 124 ]; then
            PHASE_STATUS[$phase_id]="timeout"
            log_error "[Phase ${phase_id}] ⏱️ 执行超时 (超过 ${MAX_RUNTIME} 秒)"
        else
            PHASE_STATUS[$phase_id]="failed"
            log_error "[Phase ${phase_id}] ❌ 执行失败 (退出码: $exit_code)"
        fi
    fi

    local end_ts=$(date +%s)
    PHASE_DURATION[$phase_id]=$(( end_ts - start_ts ))

    return $exit_code
}

# ─── 并行 Wave 执行 ────────────────────────────────────────

run_wave() {
    local wave_name=$1
    shift
    local phase_ids=("$@")

    log_wave "════════════════════════════════════════"
    log_wave "${wave_name} 开始: Phase ${phase_ids[*]} (并行)"
    log_wave "════════════════════════════════════════"

    local wave_start=$(date +%s)

    # Phase 定义: id -> "name|description"
    declare -A PHASE_META=(
        [0]="Phase 0|语音能力（场景零）"
        [1]="Phase 1|数据管线（场景一）"
        [2]="Phase 2|AI 搜索 + 导航（场景二）"
        [3]="Phase 3|预约 + 美团（场景三、四）"
        [4]="Phase 4|拍照 → AI 增强 → 生成遛娃视频（场景六）"
    )

    # 为每个 Phase 创建 worktree 并启动后台进程
    local pids=()
    local wt_paths=()

    for phase_id in "${phase_ids[@]}"; do
        local meta="${PHASE_META[$phase_id]}"
        local name="${meta%%|*}"
        local desc="${meta#*|}"

        local wt_path=$(create_worktree "$phase_id")
        wt_paths+=("$wt_path")

        # 启动后台执行
        execute_phase "$phase_id" "$name" "$desc" "$wt_path" &
        pids+=($!)

        log_info "[Phase ${phase_id}] 已启动 (PID: ${pids[-1]})"
    done

    # 等待所有 Phase 完成
    local failed=0
    for i in "${!pids[@]}"; do
        local pid=${pids[$i]}
        local phase_id=${phase_ids[$i]}

        if wait "$pid"; then
            log_info "[Phase ${phase_id}] 进程正常退出"
        else
            log_error "[Phase ${phase_id}] 进程异常退出"
            failed=$((failed + 1))
        fi
    done

    local wave_end=$(date +%s)
    local wave_duration=$(( wave_end - wave_start ))

    log_wave "${wave_name} 完成: 耗时 ${wave_duration}s, 失败 ${failed}/${#phase_ids[@]}"

    # merge 所有分支回 main
    for phase_id in "${phase_ids[@]}"; do
        merge_phase_branch "$phase_id" || true
        cleanup_worktree "$phase_id"
    done

    return $failed
}

# ─── 清理 ──────────────────────────────────────────────────

cleanup() {
    rm -f "$LOCK_FILE"
    # 清理残留 worktree
    if [ -d "$WORKTREE_BASE" ]; then
        cd "$PROJECT_DIR"
        for wt in "${WORKTREE_BASE}"/phase-*; do
            [ -d "$wt" ] || continue
            local phase_id=$(basename "$wt" | sed 's/phase-//')
            git worktree remove "$wt" --force 2>/dev/null || true
            git branch -D "${BRANCH_PREFIX}/phase-${phase_id}" 2>/dev/null || true
        done
        rm -rf "$WORKTREE_BASE"
        git worktree prune 2>/dev/null || true
    fi
    log_info "构建脚本结束"
}

# ─── 前置条件检查 ──────────────────────────────────────────

check_prerequisites() {
    log_info "检查前置条件..."

    # 检查是否已在运行
    if [ -f "$LOCK_FILE" ]; then
        local pid=$(cat "$LOCK_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            log_error "构建脚本已在运行 (PID: $pid)"
            exit 1
        fi
        rm -f "$LOCK_FILE"
    fi

    # 检查 Claude Code CLI
    if ! command -v claude &> /dev/null; then
        log_error "Claude Code CLI 未安装"
        exit 1
    fi

    # 检查 git worktree 支持
    if ! git worktree list &> /dev/null; then
        log_error "git worktree 不可用"
        exit 1
    fi

    # 检查项目目录
    if [ ! -d "$PROJECT_DIR" ]; then
        log_error "项目目录不存在: $PROJECT_DIR"
        exit 1
    fi

    # 检查计划文件
    if [ ! -f "$PLAN_FILE" ]; then
        log_error "计划文件不存在: $PLAN_FILE"
        exit 1
    fi

    # 检查工作区干净（有未提交更改会影响 worktree 创建）
    cd "$PROJECT_DIR"
    if [ -n "$(git status --porcelain)" ]; then
        log_warn "工作区有未提交的更改，自动 stash"
        git stash push -m "auto-build stash $(date +%Y%m%d_%H%M%S)"
    fi

    # 创建目录
    mkdir -p "$LOG_DIR" "$WORKTREE_BASE"

    log_info "前置条件检查通过"
}

# ─── Shell 并行任务 ────────────────────────────────────────
# 用于验证和部署阶段，直接执行 shell 命令而非 claude

# 全局关联数组收集 shell 任务结果
declare -A TASK_STATUS
declare -A TASK_DURATION

run_shell_task() {
    local task_id=$1
    local task_name=$2
    local task_cmd=$3
    local task_log="${LOG_DIR}/task-${task_id}.log"
    local start_ts=$(date +%s)

    log_info "[Task ${task_id}] ${task_name}"
    log_info "[Task ${task_id}] 日志: ${task_log}"

    echo "==========================================" > "$task_log"
    echo "Task: ${task_name}" >> "$task_log"
    echo "命令: ${task_cmd}" >> "$task_log"
    echo "开始: $(date '+%Y-%m-%d %H:%M:%S')" >> "$task_log"
    echo "==========================================" >> "$task_log"

    local exit_code=0
    if timeout 600 bash -c "cd '${PROJECT_DIR}' && ${task_cmd}" >> "$task_log" 2>&1; then
        TASK_STATUS[$task_id]="success"
        log_info "[Task ${task_id}] ✅ 成功"
    else
        exit_code=$?
        TASK_STATUS[$task_id]="failed"
        log_error "[Task ${task_id}] ❌ 失败 (退出码: $exit_code)"
    fi

    local end_ts=$(date +%s)
    TASK_DURATION[$task_id]=$(( end_ts - start_ts ))
    return $exit_code
}

run_shell_wave() {
    local wave_name=$1
    shift
    local task_ids=("$@")

    log_wave "════════════════════════════════════════"
    log_wave "${wave_name} 开始: Tasks ${task_ids[*]} (并行)"
    log_wave "════════════════════════════════════════"

    local wave_start=$(date +%s)

    # Task 定义: id -> "name|command"
    declare -A TASK_META=(
        [verify-h5]="H5 前端构建验证|pnpm run build:h5 2>&1 | tail -20"
        [verify-mp]="小程序构建验证|pnpm run build:mp-weixin 2>&1 | tail -20"
        [verify-cloud]="云函数语法检查|find uniCloud-aliyun/cloudfunctions -name '*.js' -not -path '*/node_modules/*' | head -50 | xargs -I{} node --check '{}' 2>&1"
        [verify-python]="Python 脚本语法检查|find scripts -name '*.py' | xargs -I{} python3 -m py_compile '{}' 2>&1"
        [verify-schema]="JSON Schema 语法检查|find uniCloud-aliyun/database -name '*.schema.json' | xargs -I{} python3 -c 'import json,sys; json.load(open(sys.argv[1])); print(\"✅\", sys.argv[1])' '{}' 2>&1"
        [build-mp]="构建小程序|pnpm run build:mp-weixin 2>&1 | tail -20"
        [upload-mp]="上传小程序|miniprogram-ci upload --appid wx0097f2621a6cb4b1 --project-path dist/build/mp-weixin --pkp \"\${MP_UPLOAD_KEY:-/opt/opt/vk-hw/private.wx0097f2621a6cb4b1.key}\" --version \"\$(date +%Y%m%d_%H%M%S)\" --desc 'auto-build $(date +%Y%m%d)' 2>&1 || echo '⚠️ 上传失败，请检查密钥文件'"
        [deploy-git]="Git 提交变更|git add -A && git diff --cached --stat && git commit -m 'feat: auto-build AI 全链路功能 $(date +%Y%m%d_%H%M%S)' --no-verify || echo '⏭️ 无变更可提交'"
    )

    local pids=()

    for task_id in "${task_ids[@]}"; do
        local meta="${TASK_META[$task_id]}"
        local name="${meta%%|*}"
        local cmd="${meta#*|}"

        run_shell_task "$task_id" "$name" "$cmd" &
        pids+=($!)

        log_info "[Task ${task_id}] 已启动 (PID: ${pids[-1]})"
    done

    # 等待所有任务完成
    local failed=0
    for i in "${!pids[@]}"; do
        local pid=${pids[$i]}
        local task_id=${task_ids[$i]}

        if wait "$pid"; then
            log_info "[Task ${task_id}] 进程正常退出"
        else
            log_error "[Task ${task_id}] 进程异常退出"
            failed=$((failed + 1))
        fi
    done

    local wave_end=$(date +%s)
    local wave_duration=$(( wave_end - wave_start ))

    log_wave "${wave_name} 完成: 耗时 ${wave_duration}s, 失败 ${failed}/${#task_ids[@]}"

    return $failed
}

# ─── 汇总报告 ──────────────────────────────────────────────

print_summary() {
    local total_start=$1
    local total_end=$(date +%s)
    local total_duration=$(( total_end - total_start ))

    local hours=$((total_duration / 3600))
    local minutes=$(( (total_duration % 3600) / 60 ))
    local seconds=$((total_duration % 60))

    echo ""
    log_info "╔════════════════════════════════════════════════════╗"
    log_info "║           自动构建执行报告                          ║"
    log_info "╠════════════════════════════════════════════════════╣"
    log_info "║  代码生成 Phase (worktree 并行)                     ║"

    local all_success=true
    for i in 0 1 2 3 4; do
        local status="${PHASE_STATUS[$i]:-skipped}"
        local duration="${PHASE_DURATION[$i]:-0}"
        local icon="⬜"
        case $status in
            success) icon="✅" ;;
            failed)  icon="❌"; all_success=false ;;
            timeout) icon="⏱️"; all_success=false ;;
            skipped) icon="⏭️" ;;
        esac
        log_info "║    Phase ${i}: ${icon} ${status} (${duration}s)"
    done

    log_info "║  构建验证 Tasks (并行)                              ║"
    for tid in verify-h5 verify-mp verify-cloud verify-python verify-schema; do
        local status="${TASK_STATUS[$tid]:-skipped}"
        local duration="${TASK_DURATION[$tid]:-0}"
        local icon="⬜"
        case $status in
            success) icon="✅" ;;
            failed)  icon="❌"; all_success=false ;;
            skipped) icon="⏭️" ;;
        esac
        log_info "║    ${tid}: ${icon} ${status} (${duration}s)"
    done

    log_info "║  部署 Tasks                                           ║"
    for tid in build-mp upload-mp deploy-git; do
        local status="${TASK_STATUS[$tid]:-skipped}"
        local duration="${TASK_DURATION[$tid]:-0}"
        local icon="⬜"
        case $status in
            success) icon="✅" ;;
            failed)  icon="❌" ;;
            skipped) icon="⏭️" ;;
        esac
        log_info "║    ${tid}: ${icon} ${status} (${duration}s)"
    done

    log_info "╠════════════════════════════════════════════════════╣"
    log_info "║  总耗时: ${hours}h ${minutes}m ${seconds}s"
    log_info "║  日志目录: ${LOG_DIR}"
    log_info "╚════════════════════════════════════════════════════╝"

    if $all_success; then
        log_info "🎉 全部执行成功！"
    else
        log_warn "⚠️ 部分任务失败，请检查日志"
    fi
}

# ─── 主流程 ────────────────────────────────────────────────

main() {
    log_info "╔══════════════════════════════════════════════╗"
    log_info "║  Babyplace AI 全链路 - 并行自动构建           ║"
    log_info "║  模式: git worktree + 多进程并行              ║"
    log_info "╚══════════════════════════════════════════════╝"

    check_prerequisites

    echo $$ > "$LOCK_FILE"
    trap cleanup EXIT

    cd "$PROJECT_DIR"
    log_info "工作目录: $(pwd)"

    local total_start=$(date +%s)

    # ──── Wave 1: 无冲突 Phase 并行 ────
    # Phase 0 (语音) + Phase 1 (数据管线) + Phase 3 (预约+美团)
    # 互不修改相同文件，可以安全并行
    run_wave "Wave 1" 0 1 3

    # ──── Wave 2: Phase 2 (AI搜索) ────
    # 修改 babyplace-admin/index.js，与 Phase 4 冲突
    run_wave "Wave 2" 2

    # ──── Wave 3: Phase 4 (拍照视频) ────
    # 也修改 babyplace-admin/index.js，必须在 Phase 2 之后
    run_wave "Wave 3" 4

    # ──── Wave 4: 并行验证 ────
    # 构建检查、语法检查互相独立，并行执行
    log_wave ""
    log_wave "════════════════════════════════════════"
    log_wave "Wave 4: 构建验证 (并行)"
    log_wave "════════════════════════════════════════"

    # 安装可能新增的依赖
    cd "$PROJECT_DIR"
    if [ -f "package.json" ]; then
        log_info "安装依赖..."
        pnpm install --no-frozen-lockfile 2>&1 | tail -5 || true
    fi

    run_shell_wave "Wave 4: 构建验证" verify-h5 verify-mp verify-cloud verify-python verify-schema

    # ──── Wave 5: 部署 ────
    # git 提交必须先于部署，云函数和 web 可并行
    log_wave ""
    log_wave "════════════════════════════════════════"
    log_wave "Wave 5: 部署"
    log_wave "════════════════════════════════════════"

    # 5a: 小程序构建 + 上传（并行）
    run_shell_wave "Wave 5a: 小程序构建上传" build-mp upload-mp

    # 5b: git 提交
    run_shell_wave "Wave 5b: Git 提交" deploy-git

    # ──── 汇总 ────
    print_summary "$total_start"
}

main "$@"
