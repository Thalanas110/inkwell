function startElectronApp({ whenReady, migrateLegacyData, createWindow }) {
  return whenReady().then(() => {
    migrateLegacyData();
    return createWindow();
  });
}

module.exports = { startElectronApp };
