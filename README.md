# Inkwell - fill and sign

A PDF fill and sign application for desktop and Android. Built with Electron and Capacitor, using SQLite for offline support.

You do not need an account to actually sign in to the app--you may use the application as is, straight out of the box. No data is collected.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Android production build

Android is packaged with Capacitor and uses native SQLite for structured data. PDFs are stored on the device, and exports are written to the device Documents directory. Browser, Electron, and Android installations keep separate local data; there is no cross-device migration or sync.

```sh
npm install
npm run android:sync
npm run android:open
npm run android:build
```

`android:open` opens the generated project in Android Studio. The Android build requires an Android SDK and a compatible Java runtime; Android Studio's bundled Java 21 is supported.
