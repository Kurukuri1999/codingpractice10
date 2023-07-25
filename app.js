const express = require("express");
const app = express();
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running");
    });
  } catch (e) {
    console.log(`DB error:${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const convertStateObjectToCamelCase = (obj) => {
  return {
    stateId: obj.state_id,
    stateName: obj.state_name,
    population: obj.population,
  };
};

const convertDistrictObjectToCamelCase = (obj) => {
  return {
    districtId: obj.district_id,
    districtName: obj.district_name,
    stateId: obj.state_id,
    cases: obj.cases,
    cured: obj.cured,
    active: obj.active,
    deaths: obj.deaths,
  };
};

const convertReportToCamelCase = (obj) => {
  return {
    totalCases: obj.cases,
    totalCured: obj.cured,
    totalActive: obj.active,
    totalDeaths: obj.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username='${username}';`;
  const databaseUser = await db.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const allStatesList = `
    select * from state;
    `;
  const statesList = await db.all(allStatesList);

  response.send(
    statesList.map((eachObj) => convertStateObjectToCamelCase(eachObj))
  );
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getState = `
    select * from state where state_id=${stateId};
    `;
  const newState = await db.get(getState);

  response.send(convertStateObjectToCamelCase(newState));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const newDistrict = `
    insert into district (district_name,state_id,cases,cured,active,deaths)
    values ('${districtName}','${stateId}','${cases}','${cured}','${active}','${deaths}');
    `;
  const addDistrict = await db.run(newDistrict);
  const districtId = addDistrict.lastId;
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrict = `
    select * from district where district_id=${districtId};
    `;
    const newDistrict = await db.get(getDistrict);
    response.send(convertDistrictObjectToCamelCase(newDistrict));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrict = `
    delete from district where district_id=${districtId};
    `;
    await db.run(deleteDistrict);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const districtDetails = request.body;
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrict = `
    update district
    set district_name='${districtName}',state_id='${stateId}',
    cases='${cases}',cured='${cured}',active='${active}',
    deaths='${deaths}' where district_id=${districtId};
    `;
    await db.run(updateDistrict);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateReport = `
    select sum(cases) as cases,
    sum(cured) as cured,
    sum(active) as active,
    sum(deaths) as deaths
    from district where state_id=${stateId};
    `;
    const stateReport = await db.get(getStateReport);

    response.send(convertReportToCamelCase(stateReport));
  }
);

module.exports = app;
