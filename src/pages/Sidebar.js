// src/components/Sidebar.js
import React from "react";
import "./Sidebar.css";

const Sidebar = ({
  userType,
  setActivePage,
  activePage,
  onLogout,
  isOpen,
  closeSidebar
}) => {

  const menus = {
    admin: [
      { key: "adminProfile", label: "Admin Profile" },
      { key: "dashboard", label: "Dashboard" },
      { key: "properties", label: "Properties" },
      { key: "users", label: "Users" },
      { key: "myrentals", label: "My Rentals" },
      { key: "transactions", label: "Transactions" },
      { key: "messages", label: "Messages" },
    ],

    owner: [
      { key: "ownerProfile", label: "Owner Profile" },
      { key: "dashboard", label: "Dashboard" },
      { key: "addrentalitem", label: "Add Rental Item", parent: "Rental Management" },
      { key: "rentalitem", label: "Rental Item", parent: "Rental Management" },
      { key: "totalEarnings", label: "Total Earnings" },
      { key: "messages", label: "Messages" },
    ],

    renter: [
      { key: "renterProfile", label: "Renter Profile" },
      { key: "browseRentals", label: "Browse Rentals" },
      { key: "myRentals", label: "My Rentals" },
      { key: "favorites", label: "Favorites" },
      { key: "messages", label: "Messages" },
    ],
  };

  const menuItems = menus[userType] || [];

  // Group menu items
  const groupedMenu = {};
  menuItems.forEach((item) => {
    if (item.parent) {
      if (!groupedMenu[item.parent]) groupedMenu[item.parent] = [];
      groupedMenu[item.parent].push(item);
    } else {
      if (!groupedMenu.root) groupedMenu.root = [];
      groupedMenu.root.push(item);
    }
  });

  const handleClick = (key) => {
    setActivePage(key);

    // ✅ AUTO CLOSE SA MOBILE LANG
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <h1 className="logo">RentHub</h1>

      <ul className="menu-list">

        {/* ROOT ITEMS */}
        {groupedMenu.root?.map((item) => (
          <li
            key={item.key}
            className={activePage === item.key ? "active" : ""}
            onClick={() => handleClick(item.key)}
          >
            {item.label}
          </li>
        ))}

        {/* GROUPED ITEMS */}
        {Object.keys(groupedMenu)
          .filter((key) => key !== "root")
          .map((group) => (
            <li key={group} className="menu-group">
              <span>{group}</span>
              <ul>
                {groupedMenu[group].map((item) => (
                  <li
                    key={item.key}
                    className={activePage === item.key ? "active" : ""}
                    onClick={() => handleClick(item.key)}
                  >
                    {item.label}
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>

      <button className="logout-btn" onClick={onLogout}>
        Logout
      </button>
    </aside>
  );
};

export default Sidebar;
