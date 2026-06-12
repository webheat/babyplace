#!/bin/bash
# ============================================================
# 遛娃宝地 - Remotion 视频渲染全链路测试
# 魔搭文生图 → 上传渲染服务 → BabyplacePoi 模板 → 视频输出
# ============================================================

set -euo pipefail

# ─── 配置 ──────────────────────────────────────────────────
AI_API_URL="${AI_API_URL:-https://aikey.aixifs.com/v1}"
AI_API_KEY="${AI_API_KEY:-t7npV6raGbd2f4HOMR4RRi0gsK2MbvPWk5TMs4i8Q9eJ80cG}"
AI_IMAGE_MODEL="${AI_IMAGE_MODEL:-wanx2.0-t2i-turbo}"

REMOTION_URL="${REMOTION_URL:-http://lanes.ymxt.top:3010}"
TEMPLATE_ID="${TEMPLATE_ID:-BabyplacePoi}"

IMAGE_DIR="${IMAGE_DIR:-/opt/babyplace/test-images}"
IMAGE_SIZE="${IMAGE_SIZE:-1024x1024}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"
MAX_WAIT="${MAX_WAIT:-300}"

# ─── 颜色 & 日志 ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()     { echo -e "[$(date '+%H:%M:%S')] $1"; }
log_ok()  { log "${GREEN}✅ $1${NC}"; }
log_fail(){ log "${RED}❌ $1${NC}"; }
log_info(){ log "${CYAN}ℹ️  $1${NC}"; }
log_step(){ log "${YELLOW}▶ $1${NC}"; }

# ─── 测试场景定义 ──────────────────────────────────────────
# 每个场景: name|英文描述|中文标签|中文摘要
SCENES=(
  "koi_garden|A joyful toddler feeding colorful koi fish in a serene Japanese garden pond, cherry blossom petals floating, warm golden hour light, photorealistic|锦鲤花园|小朋友在日式花园里喂锦鲤，樱花飘落，温暖的金色阳光"
  "beach_castle|Children building a giant sandcastle on a tropical beach with turquoise waves, parents under palm tree, bright sunny day, vibrant colors|海滩沙堡|在热带海滩上堆沙堡，碧绿海浪，椰树下欢笑"
  "autumn_cycling|A family of four cycling through an autumn forest trail covered in golden leaves, children laughing on small bikes, dappled sunlight, cinematic|秋林骑行|一家四口骑行穿越金色秋林，落叶铺满小径"
  "aquarium|Kids exploring an indoor aquarium tunnel with a massive whale shark overhead, blue ambient lighting, wonder on faces, ultra detailed|水族探秘|孩子们在水族馆隧道里仰望鲸鲨，蓝色光影，充满惊奇"
  "kite_meadow|A father and daughter flying a rainbow kite on a vast green meadow with rolling hills, fluffy clouds, pastoral and peaceful|草地放风筝|父女俩在翠绿草地上放彩虹风筝，远山白云，宁静美好"
)

# ─── 函数 ──────────────────────────────────────────────────

# 生成图片
generate_image() {
  local name=$1
  local prompt=$2
  local output="${IMAGE_DIR}/${name}.png"

  if [ -f "$output" ]; then
    log_info "已存在，跳过: ${name}.png"
    echo "$output"
    return 0
  fi

  local result
  result=$(curl -s -X POST "${AI_API_URL}/images/generations" \
    -H "Authorization: Bearer ${AI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"${AI_IMAGE_MODEL}\",
      \"prompt\": \"${prompt}\",
      \"n\": 1,
      \"size\": \"${IMAGE_SIZE}\"
    }" 2>/dev/null)

  local url
  url=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['url'])" 2>/dev/null)

  if [ -z "$url" ]; then
    log_fail "生图失败: ${name}"
    return 1
  fi

  curl -s -o "$output" "$url"
  log_ok "生成: ${name}.png ($(du -h "$output" | cut -f1))"
  echo "$output"
}

# 上传图片到渲染服务
upload_image() {
  local file=$1

  local result
  result=$(curl -s -X POST "${REMOTION_URL}/api/assets/upload" \
    -F "file=@${file}" 2>/dev/null)

  local url
  url=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])" 2>/dev/null)

  if [ -z "$url" ]; then
    log_fail "上传失败: $(basename "$file")"
    return 1
  fi

  log_ok "上传: $(basename "$file")"
  echo "$url"
}

# 提交渲染任务
submit_render() {
  local poi_name=$1
  local poi_address=$2
  local summary=$3
  shift 3
  local images_json=$1
  local tags_json=$2

  local result
  result=$(curl -s -X POST "${REMOTION_URL}/api/renders" \
    -H "Content-Type: application/json" \
    -d "{
      \"templateId\": \"${TEMPLATE_ID}\",
      \"inputProps\": {
        \"poiName\": \"${poi_name}\",
        \"poiAddress\": \"${poi_address}\",
        \"images\": ${images_json},
        \"tags\": ${tags_json},
        \"summary\": \"${summary}\"
      }
    }" 2>/dev/null)

  local render_id
  render_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['renderId'])" 2>/dev/null)

  if [ -z "$render_id" ]; then
    log_fail "渲染提交失败"
    echo "$result"
    return 1
  fi

  log_ok "渲染已提交: ${render_id}"
  echo "$render_id"
}

# 轮询渲染状态
poll_render() {
  local render_id=$1
  local elapsed=0

  while [ $elapsed -lt $MAX_WAIT ]; do
    local status_json
    status_json=$(curl -s "${REMOTION_URL}/api/renders/${render_id}" 2>/dev/null)

    local state progress video_url
    state=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
    progress=$(echo "$status_json" | python3 -c "import sys,json; print(int(float(json.load(sys.stdin)['progress'])*100))" 2>/dev/null)
    video_url=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('videoUrl',''))" 2>/dev/null)

    case "$state" in
      done)
        log_ok "渲染完成! (${elapsed}s)"
        echo "$video_url"
        return 0
        ;;
      failed)
        local error
        error=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','未知错误'))" 2>/dev/null)
        log_fail "渲染失败: ${error}"
        return 1
        ;;
      *)
        printf "\r[%s] 进度: %d%% (%ds)" "$(date +%H:%M:%S)" "$progress" "$elapsed"
        ;;
    esac

    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done

  echo ""
  log_fail "渲染超时 (>${MAX_WAIT}s)"
  return 1
}

# ─── 主流程 ────────────────────────────────────────────────

main() {
  log ""
  log "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  log "${CYAN}║  遛娃宝地 - Remotion 视频渲染全链路测试           ║${NC}"
  log "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  log ""

  mkdir -p "$IMAGE_DIR"

  # ──── Step 1: 生成图片 ────
  log_step "Step 1/4: 魔搭文生图 (${AI_IMAGE_MODEL})"
  log ""

  local image_files=()
  local image_urls=()

  for scene in "${SCENES[@]}"; do
    IFS='|' read -r name prompt tags summary <<< "$scene"
    local file
    file=$(generate_image "$name" "$prompt") || exit 1
    image_files+=("$file")
  done

  log ""

  # ──── Step 2: 上传图片 ────
  log_step "Step 2/4: 上传图片到渲染服务 (${REMOTION_URL})"
  log ""

  for file in "${image_files[@]}"; do
    local url
    url=$(upload_image "$file") || exit 1
    image_urls+=("$url")
  done

  log ""

  # ──── Step 3: 提交渲染 ────
  log_step "Step 3/4: 提交渲染任务 (模板: ${TEMPLATE_ID})"
  log ""

  # 构建 JSON 数组
  local images_json="["
  for i in "${!image_urls[@]}"; do
    [ $i -gt 0 ] && images_json+=","
    images_json+="\"${image_urls[$i]}\""
  done
  images_json+="]"

  local tags_json='["亲子","遛娃","户外","探索","快乐"]'
  local render_id
  render_id=$(submit_render \
    "遛娃宝地 · 五种快乐" \
    "爸爸妈妈的爱是最好的游乐场" \
    "锦鲤花园喂鱼、海滩堆沙堡、秋林骑行、水族馆探秘、草地放风筝——五种遛娃方式，五份童年快乐" \
    "$images_json" \
    "$tags_json") || exit 1

  log ""

  # ──── Step 4: 等待渲染 ────
  log_step "Step 4/4: 等待渲染完成 (每${POLL_INTERVAL}s轮询)"
  log ""

  local video_url
  video_url=$(poll_render "$render_id") || exit 1

  log ""
  log "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  log "${GREEN}║  🎉 全链路测试通过！                              ║${NC}"
  log "${GREEN}╠══════════════════════════════════════════════════╣${NC}"
  log "${GREEN}║  渲染ID: ${render_id}${NC}"
  log "${GREEN}║  视频URL: ${video_url}${NC}"
  log "${GREEN}║  模板: ${TEMPLATE_ID}${NC}"
  log "${GREEN}║  图片数: ${#image_urls[@]}${NC}"
  log "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
}

main "$@"
