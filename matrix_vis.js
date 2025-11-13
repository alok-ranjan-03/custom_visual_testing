looker.plugins.visualizations.add({
  id: "matrix_table_v4",
  label: "Matrix Table (Full Power BI Style)",
  options: {
    show_totals: {
      section: "Data",
      type: "boolean",
      label: "Show Subtotals",
      default: true
    },
    enable_conditional: {
      section: "Format",
      type: "boolean",
      label: "Enable Conditional Formatting",
      default: true
    },
    text_color: {
      section: "Format",
      type: "string",
      label: "Text Color",
      display: "color",
      default: "#000000"
    },
    header_color: {
      section: "Format",
      type: "string",
      label: "Header Background",
      display: "color",
      default: "#f4f4f4"
    },
    positive_color: {
      section: "Format",
      type: "string",
      label: "Positive Value Color",
      display: "color",
      default: "#008000"
    },
    negative_color: {
      section: "Format",
      type: "string",
      label: "Negative Value Color",
      display: "color",
      default: "#d00000"
    },
    font_size: {
      section: "Format",
      type: "number",
      label: "Font Size (px)",
      default: 13
    },
    border_color: {
      section: "Format",
      type: "string",
      label: "Border Color",
      display: "color",
      default: "#dcdcdc"
    }
  },

  create: function (element, config) {
    const style = `
      <style>
        .matrix-table {
          width: 100%;
          border-collapse: collapse;
          font-family: Roboto, sans-serif;
        }
        .matrix-table th, .matrix-table td {
          border: 1px solid ${config.border_color || "#dcdcdc"};
          padding: 6px 10px;
          font-size: ${config.font_size || 13}px;
          color: ${config.text_color || "#000"};
        }
        .matrix-table th {
          background-color: ${config.header_color || "#f4f4f4"};
          font-weight: 600;
          text-align: left;
        }
        .subtotal-row {
          font-weight: bold;
          background-color: #fafafa;
        }
        .grand-total {
          font-weight: bold;
          background-color: #eaeaea;
        }
        .toggle-btn {
          cursor: pointer;
          margin-right: 5px;
          user-select: none;
        }
        .hidden-row {
          display: none;
        }
        .fade-in {
          animation: fadeIn 0.25s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      </style>
    `;
    element.innerHTML = style + `<div id="matrix-container"></div>`;
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();
    const container = element.querySelector("#matrix-container");
    container.innerHTML = "";

    const dims = queryResponse.fields.dimension_like;
    const meas = queryResponse.fields.measure_like;

    if (dims.length < 1 || meas.length < 1) {
      this.addError({
        title: "Invalid Data",
        message: "Please select at least one dimension and one measure."
      });
      return;
    }

    // Helpers
    const getValue = (valObj) => parseFloat(valObj?.value) || 0;
    const formatValue = (val, conf) => {
      if (!conf.enable_conditional) return val.toLocaleString();
      if (val < 0)
        return `<span style="color:${conf.negative_color}">${val.toLocaleString()}</span>`;
      if (val > 0)
        return `<span style="color:${conf.positive_color}">${val.toLocaleString()}</span>`;
      return val.toLocaleString();
    };

    function computeTotals(rows, measureName) {
      return rows.reduce((acc, r) => acc + getValue(r[measureName]), 0);
    }

    // Recursive builder for groups
    function buildGroup(rows, dimIndex, parentKey = "", level = 0) {
      if (dimIndex >= dims.length) return "";

      let html = "";
      const dimName = dims[dimIndex].name;
      const groups = {};

      rows.forEach((r) => {
        const key = r[dimName]?.value || "Others";
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });

      Object.keys(groups).forEach((key, i) => {
        const id = `${parentKey || "root"}-${dimIndex}-${i}`;
        const children = groups[key];

        // Parent row
        html += `<tr class="level-${level}" data-group="${id}">
          <td colspan="${dimIndex}"></td>
          <td>
            ${
              dimIndex < dims.length - 1
                ? `<span class="toggle-btn" data-target="${id}">➕</span>`
                : ""
            }
            ${key}
          </td>`;

        meas.forEach((m) => {
          const subtotal = computeTotals(children, m.name);
          html += `<td>${formatValue(subtotal, config)}</td>`;
        });
        html += `</tr>`;

        // Child rows
        if (dimIndex < dims.length - 1) {
          const subHTML = buildGroup(children, dimIndex + 1, id, level + 1);
          html += `<tbody class="hidden-row" data-parent="${id}">${subHTML}</tbody>`;
        } else {
          children.forEach((r) => {
            html += `<tr class="hidden-row fade-in" data-parent="${id}">`;
            dims.forEach((d, di) => {
              html += `<td style="padding-left:${20 * (di + 1)}px">${r[d.name]?.value || ""}</td>`;
            });
            meas.forEach((m) => {
              const val = getValue(r[m.name]);
              html += `<td>${formatValue(val, config)}</td>`;
            });
            html += `</tr>`;
          });
        }

        // Row subtotal (only at last dimension)
        if (config.show_totals && dimIndex === dims.length - 1) {
          html += `<tr class="subtotal-row hidden-row" data-parent="${id}">
            <td colspan="${dims.length}">${key} Subtotal</td>`;
          meas.forEach((m) => {
            const subtotal = computeTotals(children, m.name);
            html += `<td>${formatValue(subtotal, config)}</td>`;
          });
          html += "</tr>";
        }
      });
      return html;
    }

    // Header
    let html = `<table class="matrix-table"><thead><tr>`;
    dims.forEach((d) => (html += `<th>${d.label_short}</th>`));
    meas.forEach((m) => (html += `<th>${m.label_short}</th>`));
    html += `</tr></thead><tbody>`;
    html += buildGroup(data, 0);
    html += `</tbody>`;

    // Column Subtotals & Grand Total
    if (config.show_totals) {
      html += `<tfoot><tr class="grand-total"><td colspan="${dims.length}">Grand Total</td>`;
      meas.forEach((m) => {
        const total = computeTotals(data, m.name);
        html += `<td>${formatValue(total, config)}</td>`;
      });
      html += "</tr>";

      // Column-level totals
      html += `<tr class="grand-total"><td colspan="${dims.length}">Column Subtotal</td>`;
      meas.forEach((m) => {
        const total = computeTotals(data, m.name);
        html += `<td>${formatValue(total, config)}</td>`;
      });
      html += "</tr></tfoot>`;
    }

    html += `</table>`;
    container.innerHTML = html;

    // Expand/Collapse toggle logic
    container.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-target");
        const children = container.querySelectorAll(`[data-parent='${id}']`);
        const expanded = this.textContent === "➖";
        this.textContent = expanded ? "➕" : "➖";
        children.forEach((el) => {
          if (expanded) el.classList.add("hidden-row");
          else el.classList.remove("hidden-row");
        });
      });
    });

    done();
  }
});
