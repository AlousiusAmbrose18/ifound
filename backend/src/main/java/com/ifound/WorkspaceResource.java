package com.ifound;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
@Path("/api/workspace") @Produces(MediaType.APPLICATION_JSON) @Consumes(MediaType.APPLICATION_JSON)
public class WorkspaceResource {
 @Inject BusinessStore store;@Inject AuthService auth;
 @HeaderParam("Authorization") String authorization;@HeaderParam("X-Session-Token")String session;
 public record SaveRequest(long revision,JsonNode workspace){}
 @GET public BusinessStore.Snapshot read()throws Exception{auth.user(authorization,session);return store.snapshot();}
 @PUT public BusinessStore.Outcome restore(SaveRequest request)throws Exception{var user=auth.user(authorization,session);auth.admin(user);if(request==null||request.revision()<0)throw new BadRequestException("Invalid revision.");WorkspaceValidation.validate(request.workspace());return store.mutate(request.revision(),user,"WORKSPACE_RESTORED","backup",data->{data.removeAll();data.setAll((ObjectNode)request.workspace());return com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode().put("restored",true);});}
}
