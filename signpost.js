// signpost.js

document.addEventListener("DOMContentLoaded", () => {
   const prompt = document.getElementById("setup-prompt");
   const picker = document.getElementById("bookmark-picker");
   const grid = document.getElementById("grid-container");

   // Load global settings
   chrome.storage.local.get({ globalSettings: {} }, (res) => {
      const settings = res.globalSettings;

      // Apply toggles
      document.getElementById("open-in-new-tab").checked = !!settings.openInNewTab;
      document.getElementById("confirm-before-remove").checked = !!settings.confirmBeforeRemove;

      // Apply tile size
      if (settings.tileSize) {
         document.documentElement.style.setProperty("--tile-size", `${settings.tileSize}px`);
         document.getElementById("tile-size").value = settings.tileSize;
      }

      // Apply background color
      if (settings.desktopBackgroundColor) {
         document.body.style.backgroundColor = settings.desktopBackgroundColor;
         document.getElementById("desktop-background-color").value = settings.desktopBackgroundColor;
      }

      // Apply background image
      if (settings.desktopBackgroundImage) {
         document.body.style.backgroundImage = `url(${settings.desktopBackgroundImage})`;
      }
   });

   // Save global settings
   document.getElementById("open-in-new-tab").addEventListener("change", (e) => {
      updateGlobalSetting("openInNewTab", e.target.checked);
   });

   document.getElementById("confirm-before-remove").addEventListener("change", (e) => {
      updateGlobalSetting("confirmBeforeRemove", e.target.checked);
   });

   document.getElementById("tile-size").addEventListener("input", (e) => {
      const size = parseInt(e.target.value, 10);
      if (size > 30 && size <= 300) {
         document.documentElement.style.setProperty("--tile-size", `${size}px`);
         updateGlobalSetting("tileSize", size);
      }
   });

   document.getElementById("desktop-background-color").addEventListener("input", (e) => {
      const color = e.target.value;
      document.body.style.backgroundColor = color;
      updateGlobalSetting("desktopBackgroundColor", color);
   });

   document.getElementById("desktop-background-image").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (event) {
         const base64 = event.target.result;
         document.body.style.backgroundImage = `url(${base64})`;
         updateGlobalSetting("desktopBackgroundImage", base64);
      };
      reader.readAsDataURL(file);
   });

   document.getElementById("clear-background-image").addEventListener("click", () => {
      document.getElementById("grid-container").style.backgroundImage = "none";
      updateGlobalSetting("desktopBackgroundImage", null);

      // Optional: clear file input for UX clarity
      document.getElementById("desktop-background-image").value = "";
   });

   document.getElementById("reset-global-settings").addEventListener("click", () => {
      chrome.storage.local.remove("globalSettings", () => {
         // Clear UI state
         document.getElementById("open-in-new-tab").checked = false;
         document.getElementById("confirm-before-remove").checked = false;
         document.getElementById("desktop-background-color").value = "none";
         document.getElementById("desktop-background-image").value = "";
         document.getElementById("grid-container").style.backgroundColor = "none";
         document.getElementById("grid-container").style.backgroundImage = "none";
      });
   });

   function updateGlobalSetting(key, value) {
      chrome.storage.local.get({ globalSettings: {} }, (res) => {
         const updated = { ...res.globalSettings, [key]: value };
         chrome.storage.local.set({ globalSettings: updated });
      });
   }

   // Settings panel toggle
   document.getElementById("open-settings").addEventListener("click", () => {
      document.getElementById("settings-panel").classList.remove("hidden");
   });

   document.getElementById("close-settings").addEventListener("click", () => {
      document.getElementById("settings-panel").classList.add("hidden");
   });

   // Picker cancel
   document.getElementById("close-picker").addEventListener("click", () => {
      picker.classList.add("hidden");
   });

   // Add bookmark/folder
   document.getElementById("add-bookmark").addEventListener("click", () => {
      openPicker("bookmark");
   });

   document.getElementById("add-folder").addEventListener("click", () => {
      openPicker("folder");
   });

   // Initial setup
   chrome.storage.local.get("userInitialSetup", (result) => {
      if (!result.userInitialSetup) {
         prompt.classList.remove("hidden");
      } else if (result.userInitialSetup === "loaded") {
         loadAllBookmarks();
      }

      chrome.storage.local.get(["userTiles", "customSettings"], (res) => {
         const tiles = res.userTiles || [];
         const settings = res.customSettings || {};
         tiles.forEach(tileData => renderTile(tileData, settings[tileData.id] || {}));
      });
   });

   document.getElementById("load-bookmarks").addEventListener("click", () => {
      chrome.storage.local.set({ userInitialSetup: "loaded" }, () => {
         prompt.classList.add("hidden");
         loadAllBookmarks();
      });
   });

   document.getElementById("start-empty").addEventListener("click", () => {
      chrome.storage.local.set({ userInitialSetup: "empty" }, () => {
         prompt.classList.add("hidden");
      });
   });

   function createTile(title, url) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.innerHTML = `<a href="${url}" target="_blank">${title}</a>`;
      grid.appendChild(tile);
   }

   function openPicker(type) {
      const picker = document.getElementById("bookmark-picker");
      const treeContainer = document.getElementById("bookmark-tree");
      picker.classList.remove("hidden");
      treeContainer.innerHTML = "";

      chrome.bookmarks.getTree((nodes) => {
         renderTree(nodes[0].children, treeContainer, type);
      });
   }

   function renderTree(nodes, container, type) {
      const ul = document.createElement("ul");

      for (const node of nodes) {
         const li = document.createElement("li");
         const label = document.createElement("span");

         const isFolder = node.children && node.children.length >= 0;

         // Icon HTML
         let iconHTML = "";
         if (isFolder) {
            iconHTML = "📁 ";
         } else if (node.url) {
            const domain = new URL(node.url).hostname;
            iconHTML = `<img src="https://www.google.com/s2/favicons?domain=${domain}" width="16" height="16" style="vertical-align: middle; margin-right: 4px;">`;
         }

         label.innerHTML = iconHTML + (node.title || "(no title)");
         label.style.cursor = "pointer";

         if (isFolder) {
            const toggle = document.createElement("span");
            toggle.textContent = "[+] ";
            toggle.style.cursor = "pointer";

            const childContainer = document.createElement("div");
            childContainer.style.display = "none";

            toggle.addEventListener("click", () => {
               const visible = childContainer.style.display === "block";
               childContainer.style.display = visible ? "none" : "block";
               toggle.textContent = visible ? "[+] " : "[-] ";
            });

            // 👇 Make folders selectable too, if type is 'folder'
            label.addEventListener("click", () => {
               if (type === "folder") {
                  addCustomTile(node);
                  picker.classList.add("hidden");
               }
            });

            renderTree(node.children, childContainer, type);
            li.appendChild(toggle);
            li.appendChild(label);
            li.appendChild(childContainer);
         } else {
            label.addEventListener("click", () => {
               if (type === "bookmark" && node.url) {
                  addCustomTile(node);
                  picker.classList.add("hidden");
               }
            });
            li.appendChild(label);
         }

         ul.appendChild(li);
      }

      container.appendChild(ul);
   }

   function addCustomTile(node) {
      if (node.url) {
         const tileData = {
            id: node.id,
            title: node.title,
            url: node.url,
            isFolder: false
         };
         renderTile(tileData);
         saveTile(tileData);
      } else {
         chrome.bookmarks.getChildren(node.id, (children) => {
            const tileData = {
               id: node.id,
               title: node.title,
               url: null,
               isFolder: true,
               children: children.map(c => ({
                  id: c.id,
                  title: c.title,
                  url: c.url || null
               }))
            };
            renderTile(tileData);
            saveTile(tileData);
         });
      }
   }

   function renderTile(data, custom = {}) {
      const tile = document.createElement("div");
      tile.className = "tile";

      const icon = document.createElement("div");
      icon.className = "tile-icon";

      const content = document.createElement("div");
      content.className = "tile-content";

      // Load global settings once per tile render
      chrome.storage.local.get({ globalSettings: {} }, (res) => {
         const global = res.globalSettings || {};

         // Icon
         if (custom.icon) {
            icon.innerHTML = `<img src="${custom.icon}" width="24" height="24" alt="icon">`;
         } else if (data.url) {
            const domain = new URL(data.url).hostname;
            icon.innerHTML = `<img src="https://www.google.com/s2/favicons?domain=${domain}" width="24" height="24" alt="icon">`;
         } else {
            icon.textContent = "📁";
         }

         // Title/Link
         if (data.url) {
            const link = document.createElement("a");
            link.href = data.url;
            link.textContent = data.title || "(no title)";
            link.target = global.openInNewTab ? "_blank" : "_self";
            content.appendChild(link);
         } else {
            const label = document.createElement("div");
            label.innerHTML = `<strong>${data.title}</strong><br><em>Folder</em>`;
            content.appendChild(label);
         }

         // Background color
         if (custom.color) {
            tile.style.backgroundColor = custom.color;
         }

         // Custom size for folders
         if (custom.size && data.isFolder) {
            tile.style.gridColumnEnd = `span ${custom.size.x}`;
            tile.style.gridRowEnd = `span ${custom.size.y}`;
         }

         // Menu Icon + Menu
         const menuIcon = document.createElement("span");
         menuIcon.className = "tile-menu-icon";
         menuIcon.textContent = "⋮";

         const menu = document.createElement("div");
         menu.className = "tile-menu hidden";

         // Remove
         const removeOption = document.createElement("button");
         removeOption.textContent = "Remove";
         removeOption.addEventListener("click", () => {
            const doRemove = () => {
               tile.remove();
               removeTile(data.id);
            };

            if (global.confirmBeforeRemove) {
               if (confirm("Are you sure you want to remove this tile?")) {
                  doRemove();
               }
            } else {
               doRemove();
            }
         });

         // Upload icon
         const uploadIconOption = document.createElement("button");
         uploadIconOption.textContent = "Set custom icon";
         const fileInput = document.createElement("input");
         fileInput.type = "file";
         fileInput.accept = "image/*";
         fileInput.style.display = "none";

         uploadIconOption.addEventListener("click", () => fileInput.click());

         fileInput.addEventListener("change", () => {
            const file = fileInput.files[0];
            if (file) {
               const reader = new FileReader();
               reader.onload = (e) => {
                  const base64 = e.target.result;
                  icon.innerHTML = `<img src="${base64}" width="24" height="24" alt="icon">`;
                  saveCustomSetting(data.id, "icon", base64);
               };
               reader.readAsDataURL(file);
            }
         });

         // Background color
         const colorOption = document.createElement("button");
         colorOption.textContent = "Set background color";
         const colorInput = document.createElement("input");
         colorInput.type = "color";
         colorInput.style.display = "none";

         colorOption.addEventListener("click", () => colorInput.click());

         colorInput.addEventListener("input", () => {
            const color = colorInput.value;
            tile.style.backgroundColor = color;
            saveCustomSetting(data.id, "color", color);
         });

         // Append menu items
         menu.appendChild(removeOption);
         menu.appendChild(uploadIconOption);
         menu.appendChild(colorOption);

         // Folder size
         if (data.isFolder) {
            const sizeOption = document.createElement("button");
            sizeOption.textContent = "Set size";
            sizeOption.addEventListener("click", () => {
               const modal = document.getElementById("folder-size-modal");
               const widthInput = document.getElementById("folder-width");
               const heightInput = document.getElementById("folder-height");

               widthInput.value = custom.size?.x || 2;
               heightInput.value = custom.size?.y || 2;
               modal.classList.remove("hidden");

               const applyBtn = document.getElementById("apply-folder-size");
               const cancelBtn = document.getElementById("cancel-folder-size");

               applyBtn.onclick = () => {
                  const x = parseInt(widthInput.value, 10);
                  const y = parseInt(heightInput.value, 10);
                  if (x > 0 && y > 0) {
                     tile.style.gridColumnEnd = `span ${x}`;
                     tile.style.gridRowEnd = `span ${y}`;
                     saveCustomSetting(data.id, "size", { x, y });
                     modal.classList.add("hidden");
                  }
               };

               cancelBtn.onclick = () => modal.classList.add("hidden");
            });

            menu.appendChild(sizeOption);
         }

         // Assemble tile
         tile.appendChild(icon);
         tile.appendChild(content);
         tile.appendChild(menuIcon);
         tile.appendChild(menu);
         tile.appendChild(fileInput);
         tile.appendChild(colorInput);

         menuIcon.addEventListener("click", (e) => {
            e.stopPropagation();
            menu.classList.toggle("hidden");
         });

         document.addEventListener("click", () => {
            menu.classList.add("hidden");
         });

         grid.appendChild(tile);
      });
   }


   function saveCustomSetting(id, field, value) {
      chrome.storage.local.get({ customSettings: {} }, (res) => {
         const updated = res.customSettings;
         if (!updated[id]) updated[id] = {};
         updated[id][field] = value;
         chrome.storage.local.set({ customSettings: updated });
      });
   }

   function saveTile(tileData) {
      chrome.storage.local.get({ userTiles: [] }, (res) => {
         const existing = res.userTiles;
         if (!existing.some((t) => t.id === tileData.id)) {
            existing.push(tileData);
            chrome.storage.local.set({ userTiles: existing });
         }
      });
   }

   function removeTile(id) {
      chrome.storage.local.get({ userTiles: [] }, (res) => {
         const updated = res.userTiles.filter((t) => t.id !== id);
         chrome.storage.local.set({ userTiles: updated });
      });
   }

   function loadAllBookmarks() {
      chrome.bookmarks.getTree((nodes) => {
         const roots = nodes[0].children || [];
         const bookmarksBar = roots.find(n => n.title === "Bookmarks Bar" || n.id === "1");

         if (!bookmarksBar || !bookmarksBar.children) return;

         bookmarksBar.children.forEach((node) => {
            if (node.url || (node.children && node.children.length >= 0)) {
               const tileData = {
                  id: node.id,
                  title: node.title,
                  url: node.url || null,
                  isFolder: !!node.children
               };
               renderTile(tileData);
               saveTile(tileData);
            }
         });
      });
   }

});
