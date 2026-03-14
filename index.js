const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [
      "https://volunteer-management-30292.web.app",
      "http://localhost:5173",
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// verify token middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    req.user = decoded;
    next();
  });
};

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cubbi.mongodb.net/managementDB?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const managementCollection = client
      .db("managementDB")
      .collection("management");

    const volunteerCollection = client
      .db("managementDB")
      .collection("BeVolunteer");

    // add post
    app.post("/posts", verifyToken, async (req, res) => {
      const post = req.body;

      if (req.user.email !== post.organizeEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await managementCollection.insertOne(post);
      res.send(result);
    });

    // update post
    app.put("/posts/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const query = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          thumbnail: updatedData.thumbnail,
          title: updatedData.title,
          description: updatedData.description,
          category: updatedData.category,
          location: updatedData.location,
          volunteers_needed: updatedData.volunteers_needed,
          deadline: updatedData.deadline,
        },
      };

      const result = await managementCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // delete post
    app.delete("/posts/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await managementCollection.deleteOne(query);
      res.send(result);
    });

    // get limited posts (home page)
    app.get("/post", async (req, res) => {
      const result = await managementCollection.find().limit(6).toArray();
      res.send(result);
    });

    // get all posts with search
    app.get("/posts", async (req, res) => {
      const search = req.query.search;

      let query = {};

      if (search) {
        query = {
          title: {
            $regex: search,
            $options: "i",
          },
        };
      }

      const result = await managementCollection.find(query).toArray();
      res.send(result);
    });

    // get single post
    app.get("/posts/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await managementCollection.findOne(query);
      res.send(result);
    });

    // my posts
    app.get("/my_posts", verifyToken, async (req, res) => {
      const email = req.query.email;

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const query = { organizeEmail: email };

      const result = await managementCollection.find(query).toArray();
      res.send(result);
    });

    // volunteer request
    app.post("/BeVolunteer", async (req, res) => {
      const requestVolunteer = req.body;

      const query = { _id: new ObjectId(requestVolunteer.post_id) };

      const findPost = await managementCollection.findOne(query);

      if (!findPost) {
        return res.status(404).send({ message: "Post not found" });
      }

      if (findPost.volunteers_needed <= 0) {
        return res.send({ message: "No volunteers needed" });
      }

      // decrease volunteer count
      await managementCollection.updateOne(query, {
        $inc: { volunteers_needed: -1 },
      });

      const result = await volunteerCollection.insertOne(requestVolunteer);
      res.send(result);
    });

    // get volunteer posts
    app.get("/BeVolunteer-Post", verifyToken, async (req, res) => {
      const email = req.query.email;

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const query = { user_email: email };

      const result = await volunteerCollection.find(query).toArray();
      res.send(result);
    });

    // delete volunteer request
    app.delete("/BeVolunteer-Post/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await volunteerCollection.deleteOne(query);
      res.send(result);
    });

    // JWT create
    app.post("/jwt", (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite:
            process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // logout
    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite:
            process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    console.log("MongoDB connected successfully");
  } finally {
  }
}

run().catch(console.dir);

// root route
app.get("/", (req, res) => {
  res.send("Volunteer Management Server Running");
});

// listen
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});