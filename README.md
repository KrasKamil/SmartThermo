
# TypeScript API with TypeORM

Source or program: https://levelup.gitconnected.com/creating-a-node-js-api-with-express-and-typescript-549fba5f5a33

zainstaluj typescript, yarn i postepuj zgodnie z instrukcja

jak sie bedzie program sypal to musisz dodac komende:
yarn add -D ts-node
zainstaluj npm install cors (do cross origin disabling - tutaj szczegoly https://simonplend.com/how-to-fix-those-confusing-cors-errors-when-calling-your-express-api/#:~:text=If%20you%20call%20the%20cors%20middleware%20in%20your,domain%20-%20can%20make%20requests%20to%20your%20API.);

przed rozpoczeciem serwera skompiluj pliki komenda tsc (kompilacja typescript)
wersja tsc 4.9.4
wersja node 14.21.2
skompiluj i odpal server komenda yarn start:dev lub [coderunner :)]
sprawdz url w przegladarce: http://localhost:3333/
powinien dzi wyrzucic odpowiedz z serwera
włącz plik  vapage.html 




## Run this project

- Install the dependencies:
```
yarn
```
- Run the app:
```
yarn start:dev
```
## Build and Run
- Install the dependencies:
```
yarn
```
- Build and run the app:
```
yarn build
yarn start:prod
```

