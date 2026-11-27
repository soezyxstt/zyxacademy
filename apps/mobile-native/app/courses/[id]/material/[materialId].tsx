import { productRoute } from "../../../../routing/ProductRoute";
import { StudentProductRoute } from "../../../../routing/StudentProductRoute";

export default productRoute("/courses/[id]/material/[materialId]", "student", StudentProductRoute);
