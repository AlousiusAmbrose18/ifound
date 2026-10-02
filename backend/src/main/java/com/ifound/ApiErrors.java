package com.ifound;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.*;
import java.util.Map;
@Provider
public class ApiErrors implements ExceptionMapper<WebApplicationException>{public Response toResponse(WebApplicationException e){int status=e.getResponse().getStatus();String message=status==401?"Sign in with a valid account to continue.":e.getMessage();return Response.status(status).entity(Map.of("error",message==null?"Request could not be completed.":message)).build();}}
