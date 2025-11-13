looker.plugins.visualizations.add({
  id: "drilldown_table_v4",
  label: "Drilldown Table (Dynamic Drill + Tooltip + Expand All Option)",

  options: {
    expand_all: {
      type: "boolean",
      label: "Expand All by Default",
      default: false,
      section: "Behavior",
      order: 1
    }
  },

  create: function (element) {
    element.innerHTML = `
      <style>
        .drill-container { font-family: Roboto, sans-serif; width:100%; }
        .drill-table-wrap {
          width:100%;
          background:#fff;
          border-radius:8px;
          padding:8px 10px;
          box-shadow:0 2px 6px rgba(0,0,0,0.05);
        }
        table.drill-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:14px; }
        thead.drill-thead th {
          background: linear-gradient(180deg,#fafafa,#f2f2f2);
          color:#222;
          padding:10px 12px;
          text-align:left;
          font-weight:600;
          border-bottom:1px solid #e6e6e6;
          vertical-align:middle;
        }
        tbody.drill-tbody td {
          padding:10px 12px;
          border-bottom:1px solid #f0f0f0;
          vertical-align:middle;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          transition: all 0.25s ease;
        }
        th.col-dim1 { width:70%; }
        th.col-measure { width:30%; text-align:right; }

        td.col-measure { text-align:right; font-variant-numeric:tabular-nums; }

        .node-label { 
          display:inline-flex; 
          align-items:center; 
          gap:6px; 
          cursor:pointer; 
          user-select:none;
          position: relative;
        }

        .node-label .toggle { display:inline-block; width:14px; text-align:center; color:#666; }

        .no-data { text-align:center; color:#777; padding:20px; display:none; }

        /* Tooltip Styling */
        .tooltip {
          position: absolute;
          background: #333;
          color: #fff;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transform: translateY(-5px);
          transition: opacity 0.15s ease, transform 0.15s ease;
          z-index: 10;
        }
      </style>

      <div class="drill-container">
        <div class="drill-table-wrap">
          <table class="drill-table">
            <thead class="drill-thead"></thead>
            <tbody class="drill-tbody"></tbody>
          </table>
          <div class="no-data">No data found</div>
        </div>
      </div>
      <div class="tooltip" id="tooltip"></div>
    `;
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    const thead = element.querySelector("thead.drill-thead");
    const tbody = element.querySelector("tbody.drill-tbody");
    const noData = element.querySelector(".no-data");
    const tooltip = element.querySelector("#tooltip");

    if (!data || data.length === 0) {
      thead.innerHTML = "";
      tbody.innerHTML = "";
      noData.style.display = "block";
      noData.innerText = "No data found";
      done();
      return;
    }

    noData.style.display = "none";

    const dims = queryResponse.fields.dimension_like.map(d => d.name);
    const meas = queryResponse.fields.measure_like.map(m => m.name);

    if (dims.length === 0 || meas.length === 0) {
      thead.innerHTML = "";
      tbody.innerHTML = "";
      noData.style.display = "block";
      noData.innerText = "Add at least one dimension and one measure.";
      done();
      return;
    }

    function extractValue(row, field) {
      return row[field]?.value ?? "(blank)";
    }

    // Build hierarchy
    function buildHierarchy(rows, level = 0) {
      if (level >= dims.length) return [];
      const field = dims[level];
      const groups = {};
      rows.forEach(r => {
        const key = extractValue(r, field);
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      return Object.entries(groups).map(([key, group]) => ({
        name: key,
        level,
        value: group.reduce((sum, rr) => sum + (Number(rr[meas[0]]?.value) || 0), 0),
        children: buildHierarchy(group, level + 1),
        drillLinks: group[0][dims[level]]?.links || []
      }));
    }

    const hierarchy = buildHierarchy(data);
    const expanded = new Set();

    // If expand_all option is ON, recursively expand all node IDs
    function expandAllNodes(nodes, parentId = "") {
      nodes.forEach((node, idx) => {
        const id = parentId ? `${parentId}-${idx}` : `${idx}`;
        expanded.add(id);
        if (node.children && node.children.length > 0) expandAllNodes(node.children, id);
      });
    }

    if (config.expand_all) expandAllNodes(hierarchy);

    function renderHeader(level = 0) {
      let html = "<tr>";
      html += `<th class="col-dim1">${dims[level].replace(".", " ")}</th>`;
      html += `<th class="col-measure">${meas[0].replace(".", " ")}</th>`;
      html += "</tr>";
      thead.innerHTML = html;
    }

    // Tooltip helpers
    function showTooltip(text, x, y) {
      tooltip.textContent = text;
      tooltip.style.left = x + 10 + "px";
      tooltip.style.top = y + "px";
      tooltip.style.opacity = 1;
      tooltip.style.transform = "translateY(0)";
    }

    function hideTooltip() {
      tooltip.style.opacity = 0;
      tooltip.style.transform = "translateY(-5px)";
    }

    function renderRows(nodes, parentId = "", level = 0) {
      nodes.forEach((node, idx) => {
        const id = parentId ? `${parentId}-${idx}` : `${idx}`;
        const hasChildren = node.children && node.children.length;
        const isExpanded = expanded.has(id);

        const tr = document.createElement("tr");
        const tdDim = document.createElement("td");
        const tdVal = document.createElement("td");

        tdDim.className = "col-dim1";
        tdVal.className = "col-measure";
        tdVal.textContent = node.value.toFixed(2);

        // Label setup
        const label = document.createElement("span");
        label.className = "node-label";
        label.innerHTML = hasChildren
          ? `<span class="toggle">${isExpanded ? "▼" : "▶"}</span><span>${node.name}</span>`
          : `<span style="display:inline-block;width:14px;"></span><span>${node.name}</span>`;

        // Tooltip text logic
        if (hasChildren && node.drillLinks?.length > 0) {
          label.dataset.tooltip = "Click to expand / Shift+Click to drill";
        } else if (hasChildren) {
          label.dataset.tooltip = "Click to expand";
        } else if (node.drillLinks?.length > 0) {
          label.dataset.tooltip = "Click to drill";
        }

        tdDim.style.paddingLeft = `${level * 20}px`;
        tdDim.appendChild(label);

        // Click logic: expand or drill
        label.addEventListener("click", e => {
          e.stopPropagation();
          if (hasChildren && !e.shiftKey) {
            if (expanded.has(id)) expanded.delete(id);
            else expanded.add(id);
            drawTable();
          } else if (node.drillLinks && node.drillLinks.length > 0) {
            LookerCharts.Utils.openDrillMenu({
              links: node.drillLinks,
              event: e
            });
          }
        });

        // Tooltip behavior
        label.addEventListener("mouseenter", e => {
          if (label.dataset.tooltip)
            showTooltip(label.dataset.tooltip, e.pageX, e.pageY);
        });
        label.addEventListener("mousemove", e => {
          if (label.dataset.tooltip)
            showTooltip(label.dataset.tooltip, e.pageX, e.pageY);
        });
        label.addEventListener("mouseleave", hideTooltip);

        tr.appendChild(tdDim);
        tr.appendChild(tdVal);
        tbody.appendChild(tr);

        // Recursively render children if expanded
        if (isExpanded && hasChildren) renderRows(node.children, id, level + 1);
      });
    }

    function drawTable() {
      tbody.innerHTML = "";
      renderHeader();
      renderRows(hierarchy);
    }

    drawTable();
    done && done();
  }
});
