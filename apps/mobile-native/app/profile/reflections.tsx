import { productRoute } from "../../routing/ProductRoute";
import { StudentProductRoute } from "../../routing/StudentProductRoute";

export default productRoute("/profile/reflections", "student", StudentProductRoute);
