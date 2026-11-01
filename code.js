figma.showUI(__html__, { width: 330, height: 250, title: "SpecDraw" });

const COLOR_1F = { r: 0, g: 0, b: 0 };

async function loadFonts() {
  await Promise.all([
    figma.loadFontAsync({ family: "Inter", style: "Regular" }),
    figma.loadFontAsync({ family: "Inter", style: "Bold" })
  ]);
}

// RGBA 색상값 및 투명도 파싱 (HEX 변환)
function getHexAndAlpha(paint) {
  if (!paint || paint.type !== 'SOLID') return null;
  const { r, g, b } = paint.color;
  const opacity = paint.opacity !== undefined ? paint.opacity : 1.0;

  const to255 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const toHex = (v) => to255(v).toString(16).padStart(2, '0').toLowerCase();

  return {
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
    alpha: `${Math.round(opacity * 100)}%`,
    rawRgb: { r, g, b },
    opacity: opacity
  };
}

// 텍스트 정렬값 파싱
function parseAlignments(node) {
  let v = "top";
  let h = "left";

  if (node.textAlignVertical === "CENTER") v = "center";
  else if (node.textAlignVertical === "BOTTOM") v = "bottom";

  if (node.textAlignHorizontal === "CENTER") h = "center";
  else if (node.textAlignHorizontal === "RIGHT") h = "right";
  else if (node.textAlignHorizontal === "JUSTIFIED") h = "justify";

  return `v-${v}, h-${h}`;
}

// 행간(Line-height) 계산
function getLineHeightString(node) {
  if (!node.lineHeight) return "-";
  if (node.lineHeight.unit === "PIXELS") {
    return Math.round(node.lineHeight.value);
  } else if (node.lineHeight.unit === "PERCENT") {
    const calc = (node.fontSize * node.lineHeight.value) / 100;
    return Math.round(calc);
  }
  return "auto";
}

// Corner Radius 문자열 추출 헬퍼
function getRadiusString(node) {
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    return `${Math.round(node.cornerRadius)}`;
  } else if (typeof node.cornerRadius === 'symbol') {
    // 4개 모서리 값이 각기 다른 경우 (Mixed)
    const tl = Math.round(node.topLeftRadius || 0);
    const tr = Math.round(node.topRightRadius || 0);
    const br = Math.round(node.bottomRightRadius || 0);
    const bl = Math.round(node.bottomLeftRadius || 0);

    if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
      return `${tl} ${tr} ${br} ${bl}`;
    }
  }
  return null;
}

// 노드별 속성 데이터 추출
function extractNodeProperties(node) {
  const nodeName = node.name.trim();

  // 1. bg 유형 중 "_n.9"가 포함된 경우 -> 파일명 및 사이즈 명세로 출력
  if (nodeName.includes("_n.9")) {
    const fileNameWithExt = nodeName.toLowerCase().endsWith(".png") ? nodeName : `${nodeName}.png`;
    return {
      title: "bg",
      rows: [
        {
          label: "size",
          separator: ": ",
          value: `${Math.round(node.width)}*${Math.round(node.height)}`
        },
        {
          label: "file",
          separator: ": ",
          value: fileNameWithExt
        }
      ]
    };
  }

  // 2. ic_ 또는 img_ 로 시작하는 에셋 레이어 처리
  if (nodeName.startsWith("ic_") || nodeName.startsWith("img_")) {
    const isIc = nodeName.startsWith("ic_");
    const title = isIc ? "ic" : "img";

    return {
      title: title,
      rows: [
        {
          label: "size",
          separator: ": ",
          value: `${Math.round(node.width)}*${Math.round(node.height)}`
        },
        {
          label: "file",
          separator: " : ",
          value: `${nodeName}.png`
        }
      ]
    };
  }

  // 3. 일반 노드 및 _n.9가 포함되지 않은 bg/container/일반 쉐입/텍스트 노드 처리
  let title;
  const isPlainBg = 
    nodeName === "bg" || 
    nodeName.startsWith("bg_") || 
    nodeName.startsWith("bg-") || 
    nodeName.toLowerCase().startsWith("bg") ||
    nodeName.toLowerCase().includes("container") ||
    nodeName.toLowerCase().includes("background");

  if (isPlainBg) {
    title = "bg";
  } else if (node.type === "TEXT") {
    const lowerName = nodeName.toLowerCase();
    if (lowerName.includes("_txt") || lowerName.includes("text")) {
      title = node.name;
    } else {
      title = `text : ${node.name}`;
    }
  } else {
    const typeLabel = node.type.toLowerCase();
    title = `${typeLabel} : ${node.name}`;
  }

  const rows = [];

  // 1) 배경색 (Color / Fill) 추출
  if (node.fills && Array.isArray(node.fills)) {
    const solidFill = node.fills.find(f => f.type === 'SOLID' && f.visible !== false);
    if (solidFill) {
      const primaryColor = getHexAndAlpha(solidFill);
      if (primaryColor) {
        rows.push({
          label: "color",
          separator: ":",
          value: `${primaryColor.hex} ${primaryColor.alpha}`,
          swatch: primaryColor
        });
      }
    }
  }

  // 2) 테두리색 (Border / Stroke) 추출
  if (node.strokes && Array.isArray(node.strokes)) {
    const solidStroke = node.strokes.find(s => s.type === 'SOLID' && s.visible !== false);
    if (solidStroke) {
      const strokeColor = getHexAndAlpha(solidStroke);
      if (strokeColor) {
        const strokeW = typeof node.strokeWeight === 'number' ? ` (${Math.round(node.strokeWeight)}px)` : '';
        rows.push({
          label: "border",
          separator: ":",
          value: `${strokeColor.hex} ${strokeColor.alpha}${strokeW}`,
          swatch: strokeColor
        });
      }
    }
  }

  // 3) Radius 값 추출 (bg / container 등 쉐입 및 프레임에 곡률이 존재할 경우)
  const radiusValue = getRadiusString(node);
  if (radiusValue) {
    rows.push({
      label: "radius",
      separator: ":",
      value: radiusValue
    });
  }

  // 4) 텍스트 속성 추출
  if (node.type === "TEXT") {
    if (typeof node.fontName !== "symbol") {
      rows.push({
        label: "font-face",
        separator: ":",
        value: `${node.fontName.family}-${node.fontName.style.charAt(0)}`
      });
    }

    if (typeof node.fontSize !== "symbol") {
      const lh = getLineHeightString(node);
      rows.push({
        label: "font-size",
        separator: ":",
        value: `${Math.round(node.fontSize)}(${lh})`
      });
    }

    rows.push({
      label: "font-align",
      separator: ":",
      value: parseAlignments(node)
    });

    const resolvedMaxWidth = ('maxWidth' in node && typeof node.maxWidth === 'number' && !isNaN(node.maxWidth))
      ? Math.round(node.maxWidth)
      : Math.round(node.width);

    if (resolvedMaxWidth > 0) {
      rows.push({
        label: "max-width",
        separator: ":",
        value: `${resolvedMaxWidth}`
      });
    }
  } else {
    // 쉐입 또는 프레임의 size 정보
    rows.push({
      label: "size",
      separator: ":",
      value: `${Math.round(node.width)}×${Math.round(node.height)}`
    });

    if ('maxWidth' in node && typeof node.maxWidth === 'number' && !isNaN(node.maxWidth)) {
      rows.push({
        label: "max-width",
        separator: ":",
        value: `${Math.round(node.maxWidth)}`
      });
    }
  }

  return { title, rows };
}

// 텍스트 노드 생성 헬퍼
function createSpecText(characters, isBold = false) {
  const textNode = figma.createText();
  textNode.fontName = { family: "Inter", style: isBold ? "Bold" : "Regular" };
  textNode.fontSize = 14;
  textNode.lineHeight = { unit: "PERCENT", value: 140 };
  textNode.characters = String(characters);
  textNode.fills = [{ type: 'SOLID', color: COLOR_1F }];
  return textNode;
}

// 개별 명세 카드 렌더링
function renderSpecCard(specData) {
  const card = figma.createFrame();
  card.name = `Spec - ${specData.title}`;
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 4;
  card.paddingLeft = 0;
  card.paddingRight = 0;
  card.paddingTop = 0;
  card.paddingBottom = 0;
  card.fills = [];
  card.layoutSizingHorizontal = "HUG";
  card.layoutSizingVertical = "HUG";

  // 상단 타이틀
  const titleNode = createSpecText(specData.title, true);
  card.appendChild(titleNode);

  // 속성 그룹 컨테이너
  const propsGroup = figma.createFrame();
  propsGroup.name = "Properties Group";
  propsGroup.layoutMode = "VERTICAL";
  propsGroup.itemSpacing = 0;
  propsGroup.paddingLeft = 0;
  propsGroup.paddingRight = 0;
  propsGroup.paddingTop = 0;
  propsGroup.paddingBottom = 0;
  propsGroup.fills = [];
  propsGroup.layoutSizingHorizontal = "HUG";
  propsGroup.layoutSizingVertical = "HUG";

  for (const item of specData.rows) {
    const row = figma.createFrame();
    row.name = item.label;
    row.layoutMode = "HORIZONTAL";
    row.primaryAxisAlignItems = "MIN";
    row.counterAxisAlignItems = "CENTER";
    row.itemSpacing = 4;
    row.paddingLeft = 0;
    row.paddingRight = 0;
    row.paddingTop = 0;
    row.paddingBottom = 0;
    row.fills = [];
    row.layoutSizingHorizontal = "HUG";
    row.layoutSizingVertical = "HUG";

    const sep = item.separator !== undefined ? item.separator : ":";
    const labelNode = createSpecText(`${item.label}${sep}`, false);
    row.appendChild(labelNode);

    // 컬러 스와치 (컬러값이 있는 경우)
    if (item.swatch) {
      const swatch = figma.createFrame();
      swatch.name = "Color Swatch";
      swatch.resize(11, 11);
      swatch.cornerRadius = 2;
      swatch.fills = [{
        type: 'SOLID',
        color: item.swatch.rawRgb,
        opacity: item.swatch.opacity
      }];
      row.appendChild(swatch);
    }

    const valNode = createSpecText(item.value, false);
    row.appendChild(valNode);

    propsGroup.appendChild(row);
  }

  card.appendChild(propsGroup);
  return card;
}

// 절대 좌표 바운딩 박스 계산
function getSelectionBounds(nodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    try {
      const absX = node.absoluteTransform ? node.absoluteTransform[0][2] : node.x;
      const absY = node.absoluteTransform ? node.absoluteTransform[1][2] : node.y;
      const width = node.width || 0;
      const height = node.height || 0;

      minX = Math.min(minX, absX);
      minY = Math.min(minY, absY);
      maxX = Math.max(maxX, absX + width);
      maxY = Math.max(maxY, absY + height);
    } catch (e) {
      // transform 오류 방어
    }
  }

  if (minX === Infinity) {
    return {
      minX: figma.viewport.center.x,
      minY: figma.viewport.center.y,
      maxX: figma.viewport.center.x + 100,
      maxY: figma.viewport.center.y + 100
    };
  }

  return { minX, minY, maxX, maxY };
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'close-plugin') {
    figma.closePlugin();
    return;
  }

  if (msg.type === 'start-extraction') {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("추출할 레이어를 1개 이상 선택해 주세요.");
      return;
    }

    try {
      figma.ui.postMessage({ type: 'progress-update', percent: 10, status: '폰트 로딩 중...' });
      await loadFonts();

      // 대상 노드 수집
      let targetNodes = [];
      if (msg.extractMode === 'deep') {
        function collectDeep(n) {
          const nName = n.name.trim().toLowerCase();
          const isSpecialAsset = 
            nName.includes("_n.9") ||
            nName.startsWith("ic_") ||
            nName.startsWith("img_");

          if (isSpecialAsset) {
            targetNodes.push(n);
            return;
          }

          const hasFill = n.fills && Array.isArray(n.fills) && n.fills.length > 0;
          const hasStroke = n.strokes && Array.isArray(n.strokes) && n.strokes.length > 0;

          if (n.type === "TEXT" || hasFill || hasStroke) {
            targetNodes.push(n);
          }

          if ('children' in n) {
            for (const child of n.children) {
              collectDeep(child);
            }
          }
        }
        selection.forEach(collectDeep);
      } else {
        targetNodes = [...selection];
      }

      if (targetNodes.length === 0) {
        targetNodes = [...selection];
      }

      // 최상위 스펙 보드 생성
      const masterWrapper = figma.createFrame();
      masterWrapper.name = "Extracted Spec Board";
      masterWrapper.layoutMode = "VERTICAL";
      masterWrapper.itemSpacing = 24;
      masterWrapper.paddingLeft = 4;
      masterWrapper.paddingRight = 0;
      masterWrapper.paddingTop = 0;
      masterWrapper.paddingBottom = 0;
      masterWrapper.fills = [];
      masterWrapper.layoutSizingHorizontal = "HUG";
      masterWrapper.layoutSizingVertical = "HUG";

      // 개별 명세 카드 추가
      for (let i = 0; i < targetNodes.length; i++) {
        const node = targetNodes[i];
        const specData = extractNodeProperties(node);
        const card = renderSpecCard(specData);
        masterWrapper.appendChild(card);

        const percent = 20 + Math.floor(((i + 1) / targetNodes.length) * 75);
        figma.ui.postMessage({
          type: 'progress-update',
          percent: percent,
          status: `노드 분석 중 (${i + 1}/${targetNodes.length})`
        });
      }

      // 위치 지정: 선택 요소 우측(32px 거리)에 안전하게 배치
      const bounds = getSelectionBounds(selection);
      const firstTarget = selection[0];
      const targetParent = firstTarget ? firstTarget.parent : null;

      let placedInParent = false;
      if (
        targetParent &&
        targetParent.type !== "PAGE" &&
        targetParent.type !== "DOCUMENT" &&
        targetParent.type !== "SECTION" &&
        targetParent.layoutMode === "NONE" &&
        !targetParent.isAsset
      ) {
        try {
          targetParent.appendChild(masterWrapper);
          masterWrapper.x = firstTarget.x + firstTarget.width + 32;
          masterWrapper.y = firstTarget.y;
          placedInParent = true;
        } catch (err) {
          placedInParent = false;
        }
      }

      if (!placedInParent) {
        figma.currentPage.appendChild(masterWrapper);
        masterWrapper.x = bounds.maxX + 32;
        masterWrapper.y = bounds.minY;
      }

      figma.currentPage.selection = [masterWrapper];
      figma.viewport.scrollAndZoomIntoView([masterWrapper]);

      figma.notify("속성 명세 카드가 생성되었습니다!");
      figma.ui.postMessage({ type: 'extraction-completed' });
    } catch (error) {
      figma.notify("오류가 발생했습니다: " + error.message);
      figma.ui.postMessage({
        type: 'progress-update',
        percent: 100,
        status: '오류 발생: ' + error.message
      });
    }
  }
};