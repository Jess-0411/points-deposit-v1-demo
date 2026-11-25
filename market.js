
    const devices = [
      {
        id: "d1",
        name: "德育楼一层",
        goods: [
          { name: "LE30433455434闹钟", type: "clock", tag: "库存告急", points: 500, exchanged: 200, stock: 1, isNew: true },
          { name: "4345443中性笔替芯", type: "pen", points: 200, exchanged: 200, stock: 10 },
          { name: "LE3044433444闹钟", type: "clock", points: 500, exchanged: 200, stock: 10 },
          { name: "LE42444中性笔替芯", type: "pen", points: 200, exchanged: 200, stock: 10 },
          { name: "LE304闹钟", type: "pen", tag: "DELI", points: 200, exchanged: 200, stock: 12 },
          { name: "中性笔替芯", type: "book", tag: "DELI", points: 200, exchanged: 200, stock: 8 }
        ]
      },
      {
        id: "d2",
        name: "综合楼大厅",
        goods: [
          { name: "儿童成长闹钟", type: "clock", tag: "热门", points: 520, exchanged: 318, stock: 6 },
          { name: "黑色中性笔套装", type: "pen", points: 260, exchanged: 286, stock: 14, isNew: true },
          { name: "彩虹便签本", type: "book", tag: "NEW", points: 120, exchanged: 92, stock: 26, isNew: true },
          { name: "考试专用笔芯", type: "pen", points: 180, exchanged: 164, stock: 18 }
        ]
      },
      {
        id: "d3",
        name: "图书馆入口",
        goods: [
          { name: "阅读打卡便签本", type: "book", tag: "NEW", points: 150, exchanged: 71, stock: 20, isNew: true },
          { name: "浅蓝静音闹钟", type: "clock", points: 480, exchanged: 66, stock: 9 },
          { name: "学生签字笔替芯", type: "pen", points: 160, exchanged: 84, stock: 15 }
        ]
      },
      {
        id: "d4",
        name: "操场服务点",
        goods: []
      }
    ];

    let currentDeviceId = devices[0].id;
    let currentFilter = "all";
    const deviceList = document.getElementById("deviceList");
    const goodsGrid = document.getElementById("goodsGrid");
    const emptyState = document.getElementById("emptyState");
    const toast = document.getElementById("toast");
    const recordSheet = document.getElementById("recordSheet");
    const marketPrd = document.getElementById("marketPrd");
    document.getElementById("openMarketPrd").addEventListener("click", () => marketPrd.showModal());

    function showToast(text) {
      toast.textContent = text;
      toast.classList.add("show");
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1500);
    }

    function renderDevices() {
      deviceList.innerHTML = devices.map(device => `
        <button class="device-chip ${device.id === currentDeviceId ? "active" : ""}" type="button" data-device="${device.id}" title="${device.name}">
          <i class="dot"></i><span>${device.name}</span>
        </button>
      `).join("");
    }

    function getGoods() {
      const device = devices.find(item => item.id === currentDeviceId);
      let goods = [...device.goods];
      if (currentFilter === "popular") goods.sort((a, b) => b.exchanged - a.exchanged);
      if (currentFilter === "new") goods = goods.filter(item => item.isNew);
      if (currentFilter === "low") goods.sort((a, b) => a.points - b.points);
      if (currentFilter === "high") goods.sort((a, b) => b.points - a.points);
      return { device, goods };
    }

    function art(type) {
      if (type === "clock") return `<div class="goods-art clock"><i class="tile"></i><i class="tile"></i></div>`;
      if (type === "book") return `<div class="book"></div>`;
      return `<div class="pen"><i></i><i></i><i></i><i></i></div>`;
    }

    function renderGoods() {
      const { device, goods } = getGoods();
      goodsGrid.style.display = goods.length ? "grid" : "none";
      emptyState.style.display = goods.length ? "none" : "grid";
      goodsGrid.innerHTML = goods.map(item => `
        <article class="card">
          <div class="thumb">
            ${item.tag ? `<span class="tag">${item.tag}</span>` : ""}
            ${art(item.type)}
          </div>
          <div class="info">
            <div class="name">${item.name}</div>
            <div class="meta"><span>${item.exchanged}人兑换</span><span>剩余： ${item.stock}</span></div>
            <div class="price">${item.points}<small>积分</small></div>
          </div>
        </article>
      `).join("");
    }

    deviceList.addEventListener("click", event => {
      const chip = event.target.closest("[data-device]");
      if (!chip) return;
      currentDeviceId = chip.dataset.device;
      currentFilter = "all";
      document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.filter === "all"));
      renderDevices();
      renderGoods();
      const device = devices.find(item => item.id === currentDeviceId);
      showToast(`已切换至${device.name}`);
    });

    document.querySelector(".tabs").addEventListener("click", event => {
      const tab = event.target.closest("[data-filter]");
      if (!tab) return;
      currentFilter = tab.dataset.filter;
      document.querySelectorAll(".tab").forEach(item => item.classList.toggle("active", item === tab));
      renderGoods();
    });

    document.querySelector(".back").addEventListener("click", () => {
      if (history.length > 1) history.back();
      else location.href = "./?view=mobile";
    });
    document.getElementById("recordBtn").addEventListener("click", () => {
      recordSheet.showModal();
    });
    document.getElementById("closeSheet").addEventListener("click", () => {
      recordSheet.close();
    });
    recordSheet.addEventListener("click", event => {
      if (event.target === recordSheet) recordSheet.close();
    });

    renderDevices();
    renderGoods();
  
